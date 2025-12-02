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
let guardians = [
    { name: "You (Admin)", role: "admin", id: "parent_1" }
];

let children = [
    {
        id: "child_default",
        username: "teen_user", 
        name: "Teen User",
        status: "Online",
        verified: true,
        curfew: { enabled: true, start: "21:00", end: "06:00" },
        friends: [], // New: Track friends
        activityLog: []
    }
];

let activeInvites = [];

io.on('connection', (socket) => {
    
    // --- DATA SYNC ---
    socket.on('get data', () => {
        socket.emit('update data', { children, guardians });
    });

    // --- PARENT MANAGEMENT ---
    socket.on('generate invite', () => {
        const code = "FAM-" + Math.floor(1000 + Math.random() * 9000);
        activeInvites.push(code);
        socket.emit('invite code', code);
    });

    socket.on('join family', (code) => {
        if (activeInvites.includes(code)) {
            const newGuardian = { name: "Co-Parent", role: "guardian", id: "parent_" + Date.now() };
            guardians.push(newGuardian);
            socket.emit('login success', { username: "ParentUser", role: "parent" });
            io.emit('update data', { children, guardians }); // Update everyone
        } else {
            socket.emit('login failed', "Invalid code.");
        }
    });

    socket.on('remove guardian', (id) => {
        guardians = guardians.filter(g => g.id !== id);
        io.emit('update data', { children, guardians });
    });

    socket.on('parent login', () => {
        socket.emit('login success', { username: "ParentUser", role: "parent" });
    });

    // --- CHILD LOGIC ---
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
            friends: [],
            activityLog: []
        };
        children.push(newChild);
        io.emit('update data', { children, guardians });
    });

    socket.on('child login', (username) => {
        const child = children.find(c => c.username === username);
        if (child) {
            child.status = "Online";
            io.emit('update data', { children, guardians });
            socket.emit('login success', { username: child.username, role: "child" });
        } else {
            socket.emit('login failed', "Username not found.");
        }
    });

    // NEW: ADD FRIEND
    socket.on('add friend', (data) => {
        const child = children.find(c => c.username === data.childUser);
        if(child) {
            // Check if already friends
            if(!child.friends.find(f => f.username === data.friendUser)) {
                child.friends.push({ name: data.friendUser, username: data.friendUser });
                
                // Alert Parent
                child.activityLog.unshift({
                    id: "log_" + Date.now(),
                    type: "alert", // Grey alert (safe)
                    user: data.friendUser,
                    text: "Added as a new friend",
                    time: "Just now"
                });
                
                io.emit('update data', { children, guardians });
                socket.emit('toast', "Friend Added!");
            }
        }
    });

    // --- CORE FEATURES ---
    socket.on('update settings', (data) => {
        const child = children.find(c => c.id === data.childId);
        if (child) {
            child.curfew = data.curfew;
            io.emit('update data', { children, guardians });
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
            io.emit('chat message', { sender: username, recipient: "ParentUser", text: "🚨 SOS ALERT TRIGGERED 🚨" });
            io.emit('update data', { children, guardians });
            io.emit('toast', `SOS ALERT from ${child.name}!`);
        }
    });

    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

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
            } else if (lower.includes("movie") || lower.includes("game")) {
                reply = "I focus only on schoolwork.";
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
