const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- DATABASE ---
let children = [
    {
        id: "child_default",
        username: "teen_user", 
        name: "Teen User",
        status: "Online",
        verified: true,
        curfew: { enabled: true, start: "21:00", end: "06:00" },
        activityLog: []
    }
];

// Active Invite Codes (e.g., ["FAM-1234"])
let activeInvites = [];

// --- LOGIC ---
io.on('connection', (socket) => {
    
    // 1. GENERATE INVITE (Parent A)
    socket.on('generate invite', () => {
        const code = "FAM-" + Math.floor(1000 + Math.random() * 9000);
        activeInvites.push(code);
        socket.emit('invite code', code);
    });

    // 2. JOIN FAMILY (Parent B)
    socket.on('join family', (code) => {
        if (activeInvites.includes(code)) {
            // Success! Link them to the existing family data
            socket.emit('login success', { username: "Co-Parent", role: "parent" });
        } else {
            socket.emit('login failed', "Invalid or expired code.");
        }
    });

    // 3. STANDARD PARENT LOGIN
    socket.on('parent login', () => {
        // In a real app, check password. Here, just let them in.
        socket.emit('login success', { username: "Admin Parent", role: "parent" });
    });

    // --- CHILD & DATA LOGIC ---
    socket.on('get children', () => {
        socket.emit('update children list', children);
    });

    socket.on('register child', (data) => {
        if(children.find(c => c.username === data.username)) {
            socket.emit('error message', "Username taken.");
            return;
        }
        const newChild = {
            id: "child_" + Date.now(),
            username: data.username,
            name: data.name,
            status: "Offline",
            verified: false,
            curfew: { enabled: true, start: "21:00", end: "06:00" },
            activityLog: []
        };
        children.push(newChild);
        io.emit('update children list', children);
    });

    socket.on('update settings', (data) => {
        const child = children.find(c => c.id === data.childId);
        if (child) {
            child.curfew = data.curfew;
            socket.emit('update children list', children);
        }
    });

    socket.on('child login', (username) => {
        const child = children.find(c => c.username === username);
        if (child) {
            child.status = "Online";
            io.emit('update children list', children);
            socket.emit('login success', { username: child.username, role: "child" });
        } else {
            socket.emit('login failed', "Username not found.");
        }
    });

    socket.on('sos signal', (username) => {
        const child = children.find(c => c.username === username);
        if(child) {
            child.status = "🚨 SOS ALERT! 🚨";
            child.activityLog.unshift({
                id: "log_" + Date.now(),
                type: "alert",
                user: "SYSTEM",
                text: "Triggered the Panic Button",
                time: "Just now"
            });
            io.emit('chat message', { 
                sender: username, 
                recipient: "ParentUser", 
                text: "🚨 SOS ALERT TRIGGERED 🚨" 
            });
            io.emit('update children list', children);
            io.emit('toast', `SOS ALERT from ${child.name}!`);
        }
    });

    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    // AI Tutor
    socket.on('tutor message', (msg) => {
        socket.emit('chat message', { sender: msg.sender, recipient: 'AI_Tutor', text: msg.text });
        setTimeout(() => {
            const lower = msg.text.toLowerCase();
            let reply = "Hello! I am Tutor Tom.";
            if (/[0-9]/.test(lower) && /[\+\-\*x\/]/.test(lower)) {
                try {
                    let cleanMath = lower.replace(/[^0-9\+\-\*\/\.x]/g, '').replace(/x/g, '*');
                    let result = eval(cleanMath); 
                    reply = `The answer is ${result}.`;
                } catch (e) {}
            } else if (lower.includes("math") || lower.includes("science")) {
                reply = "I can help with that subject.";
            }
            socket.emit('chat message', { sender: 'AI_Tutor', recipient: msg.sender, text: reply });
        }, 800);
    });

    socket.on('verify identity', () => {
        setTimeout(() => { socket.emit('verification complete'); }, 3000);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Tutum running on port ${PORT}`);
});
