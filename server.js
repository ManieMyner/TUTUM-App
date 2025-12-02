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
// We now store bio and avatar for everyone
let guardians = [
    { 
        id: "parent_1", 
        username: "ParentUser", // The main admin login
        name: "Admin Parent", 
        role: "admin",
        bio: "Head of House",
        avatar: "👑" 
    }
];

let children = [
    {
        id: "child_default",
        username: "teen_user", 
        name: "Teen User",
        status: "Online",
        verified: true,
        curfew: { enabled: true, start: "21:00", end: "06:00" },
        bio: "Just chilling...",
        avatar: "😎",
        friends: [],
        activityLog: []
    }
];

let activeInvites = [];

io.on('connection', (socket) => {
    
    // --- SYNC ---
    socket.on('get data', () => {
        socket.emit('update data', { children, guardians });
    });

    // --- PROFILE MANAGEMENT (NEW) ---
    socket.on('update profile', (data) => {
        // Data contains: { username, name, bio, avatar, role }
        let user;
        if(data.role === 'child') {
            user = children.find(c => c.username === data.username);
        } else {
            // Find guardian by ID or Username (for simplicity in prototype we track by ID usually, but username here)
            user = guardians.find(g => g.username === data.username);
        }

        if(user) {
            if(data.name) user.name = data.name;
            if(data.bio) user.bio = data.bio;
            if(data.avatar) user.avatar = data.avatar;
            
            // Broadcast update to everyone so screens refresh
            io.emit('update data', { children, guardians });
            socket.emit('toast', "Profile Updated!");
        }
    });

    // --- PARENT LOGIC ---
    socket.on('generate invite', () => {
        const code = "FAM-" + Math.floor(1000 + Math.random() * 9000);
        activeInvites.push(code);
        socket.emit('invite code', code);
    });

    socket.on('join family', (data) => {
        // data = { code, name, username }
        if (activeInvites.includes(data.code)) {
            const newGuardian = { 
                id: "p_" + Date.now(),
                username: data.username, // New login ID
                name: data.name, 
                role: "guardian",
                bio: "Co-Parent",
                avatar: "🛡️"
            };
            guardians.push(newGuardian);
            
            // Log them in immediately
            socket.emit('login success', { username: newGuardian.username, role: "parent" });
            io.emit('update data', { children, guardians });
        } else {
            socket.emit('login failed', "Invalid code.");
        }
    });

    socket.on('parent login', (username) => {
        // Check if this username exists in guardians
        // For the Prototype, "ParentUser" is hardcoded as Admin. 
        // Any other username must be in the guardians list.
        const user = guardians.find(g => g.username === username);
        
        if (user) {
            socket.emit('login success', { username: user.username, role: "parent" });
        } else {
            socket.emit('login failed', "Parent not found. Use invite code if new.");
        }
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
            bio: "New to Tutum",
            avatar: "🙂",
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

    // --- CORE FEATURES ---
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
            // Alert ALL parents
            guardians.forEach(g => {
                 io.emit('chat message', { sender: username, recipient: g.username, text: "🚨 SOS ALERT TRIGGERED 🚨" });
            });
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
