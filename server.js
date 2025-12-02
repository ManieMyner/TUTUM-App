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

io.on('connection', (socket) => {
    
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
            socket.emit('login success', child);
        } else {
            socket.emit('login failed', "Username not found.");
        }
    });

    // --- SOS LOGIC (UPDATED) ---
    socket.on('sos signal', (username) => {
        const child = children.find(c => c.username === username);
        if(child) {
            // 1. Update Status
            child.status = "🚨 SOS ALERT! 🚨";
            
            // 2. Log it
            child.activityLog.unshift({
                id: "log_" + Date.now(),
                type: "alert",
                user: "SYSTEM",
                text: "Triggered the Panic Button",
                time: "Just now"
            });
            
            // 3. SEND CHAT MESSAGE (Fixes missing message)
            io.emit('chat message', { 
                sender: username, 
                recipient: "ParentUser", 
                text: "🚨 SOS ALERT TRIGGERED 🚨" 
            });

            // 4. Update Everyone
            io.emit('update children list', children);
            io.emit('toast', `SOS ALERT from ${child.name}!`);
        }
    });

    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    socket.on('flag user', (data) => socket.emit('toast', `Flag sent to ${data.targetUser}'s parents.`));
    socket.on('block user', (data) => {
        const child = children.find(c => c.id === data.childId);
        if (child) {
            child.activityLog = child.activityLog.filter(log => log.id !== data.logId);
            socket.emit('update children list', children);
        }
    });
    
    socket.on('simulate bully', () => {
        const child = children[0];
        child.activityLog.unshift({
            id: "log_" + Date.now(),
            type: "alert",
            user: "random_bully",
            text: "sent harmful message",
            time: "Just now"
        });
        io.emit('update children list', children);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Tutum running on port ${PORT}`);
});