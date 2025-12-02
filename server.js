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

// --- SETTINGS ---
const bannedWords = ["stupid", "hate", "ugly", "idiot", "kill"];

// --- LOGIC ---
io.on('connection', (socket) => {
    
    // 1. PARENT VERIFICATION (NEW)
    socket.on('verify identity', () => {
        // Simulate a 3-second API call to an ID provider
        setTimeout(() => {
            socket.emit('verification complete');
        }, 3000);
    });

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

    // --- CHAT LOGIC ---
    socket.on('chat message', (msg) => {
        if (msg.text) {
            let isBad = false;
            for (let word of bannedWords) {
                if (msg.text.toLowerCase().includes(word)) {
                    isBad = true;
                    break;
                }
            }
            if (isBad) {
                socket.emit('error message', "Message blocked: Language.");
                return; 
            }
        }
        io.emit('chat message', msg);
    });

    // --- AI TUTOR LOGIC ---
    socket.on('tutor message', (msg) => {
        socket.emit('chat message', { sender: msg.sender, recipient: 'AI_Tutor', text: msg.text });

        setTimeout(() => {
            const lower = msg.text.toLowerCase();
            let reply = "";

            if (/[0-9]/.test(lower) && /[\+\-\*x\/]/.test(lower)) {
                try {
                    let cleanMath = lower.replace(/[^0-9\+\-\*\/\.x]/g, '').replace(/x/g, '*');
                    let result = eval(cleanMath); 
                    reply = `The answer is ${result}.`;
                } catch (e) {
                    reply = "I couldn't calculate that. Try '5 + 5'.";
                }
            }
            else if (lower.includes("math") || lower.includes("science") || lower.includes("history")) {
                reply = "I can help with that! What's the question?";
            } 
            else if (lower.includes("game") || lower.includes("movie") || lower.includes("party")) {
                reply = "I am strictly a Homework Tutor. Let's focus on school.";
            } 
            else {
                reply = "Hello! I am Tutor Tom. Ask me a math question.";
            }

            socket.emit('chat message', { sender: 'AI_Tutor', recipient: msg.sender, text: reply });
        }, 800);
    });

    socket.on('flag user', (data) => socket.emit('toast', `Flag sent to ${data.targetUser}'s parents.`));
    
    socket.on('block user', (data) => {
        const child = children.find(c => c.id === data.childId);
        if (child) {
            child.activityLog = child.activityLog.filter(log => log.id !== data.logId);
            socket.emit('update children list', children);
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Tutum running on port ${PORT}`);
});
