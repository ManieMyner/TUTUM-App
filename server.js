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

// Active Invite Codes
let activeInvites = [];

io.on('connection', (socket) => {
    
    socket.on('get children', () => {
        socket.emit('update children list', children);
    });

    // 1. INVITE LOGIC
    socket.on('generate invite', () => {
        const code = "FAM-" + Math.floor(1000 + Math.random() * 9000);
        activeInvites.push(code);
        socket.emit('invite code', code);
    });

    socket.on('join family', (code) => {
        if (activeInvites.includes(code)) {
            // FIX: Ensure Co-Parent uses the same ID as the main parent for chat to work
            socket.emit('login success', { username: "ParentUser", role: "parent" });
        } else {
            socket.emit('login failed', "Invalid or expired code.");
        }
    });

    // 2. PARENT LOGIN (FIXED USERNAME)
    socket.on('parent login', () => {
        // FIX: Must match what the child sends to ('ParentUser')
        socket.emit('login success', { username: "ParentUser", role: "parent" });
    });

    // 3. CHILD REGISTRATION
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

    // 4. SOS SIGNAL
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
            // Send alert to parent chat
            io.emit('chat message', { 
                sender: username, 
                recipient: "ParentUser", 
                text: "🚨 SOS ALERT TRIGGERED 🚨" 
            });
            io.emit('update children list', children);
            io.emit('toast', `SOS ALERT from ${child.name}!`);
        }
    });

    // 5. CHAT RELAY
    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    // 6. AI TUTOR
    socket.on('tutor message', (msg) => {
        socket.emit('chat message', { sender: msg.sender, recipient: 'AI_Tutor', text: msg.text });
        setTimeout(() => {
            const lower = msg.text.toLowerCase();
            let reply = "Hello! I am Tutor Tom.";
            
            // Math Logic
            if (/[0-9]/.test(lower) && /[\+\-\*x\/]/.test(lower)) {
                try {
                    let cleanMath = lower.replace(/[^0-9\+\-\*\/\.x]/g, '').replace(/x/g, '*');
                    let result = eval(cleanMath); 
                    reply = `The answer is ${result}.`;
                } catch (e) {
                    reply = "I couldn't calculate that.";
                }
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
