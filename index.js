const express = require('express');
const http = require('http');
//const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const app = express();
const server = http.createServer(app);
const {Server} = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'twclone',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
const NodeCache = require("node-cache");
const twchatCache = new NodeCache({stdTTL: 43200, checkperiod: 43260});

const gerUserNameByUserToken = async (userToken) => {
    try {
        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Execute the SQL query
        const [rows] = await connection.execute(
            'SELECT u.username ' +
            'FROM users u ' +
            'INNER JOIN users_session us ON u.unique_id = us.user_uniqueid ' +
            'WHERE us.user_token = ?',
            [userToken]
        );

        // Release the connection back to the pool
        connection.release();

        if (rows.length === 0) {
            return null;
        }

        return rows[0].username;
    } catch (error) {
        return null;
    }
}

//const wss = new WebSocket.Server({ server });

// Store WebSocket clients and user tokens
//const clients = new Map();
io.on('connection', async (socket) => {
    console.log("connected");
    const gameWorld = socket.handshake.query.gameWorld;
    console.log(twchatCache.get("" + gameWorld + ""));
    let mykeys = twchatCache.keys();

    console.log( mykeys );
    let worldMessages = {};
    if (twchatCache.get("" + gameWorld + "") !== undefined) {
        worldMessages = twchatCache.get("" + gameWorld + "");
        io.to(socket.id).emit("twchatCachedMessages", worldMessages);
    }
    // const userToken = socket.handshake.query.user_token;
    // if (!userToken) {
    //     socket.disconnect(true);
    //     return;
    // }
    // let userName = await gerUserNameByUserToken(userToken);
    //
    // if (userName === null) {
    //     socket.disconnect(true);
    //     return;
    // }
    //
    // console.log(userName + ' a user connected');

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });

    // socket.on('chat message', (msg) => {
    //     io.emit('chat message', JSON.stringify({"message":msg, "userName":userName}));
    // });

    socket.on('twChat', (msg) => {
        if (twchatCache.get("" + gameWorld + "") !== undefined) {
            let cachedMessages = twchatCache.get("" + gameWorld + "");
            let parsed = [JSON.parse(cachedMessages)];
            parsed = parsed.push(JSON.parse(msg));
            twchatCache.set("" + gameWorld + "", JSON.stringify(parsed));
        } else {
            twchatCache.set("" + gameWorld + "", msg);
        }
        io.emit('twChatResend', msg);
    });

    socket.on('twchatReceiveMessages', (msg) => {
        io.emit("twchatReceiveMessage", msg);
    });
});
// Middleware to check user token on WebSocket connection
// wss.on('connection', (ws, req) => {
//
//     const userToken = new URLSearchParams(req.url).get('/?user_token');
//
//     if (!userToken) {
//         // Close the WebSocket connection if no token is provided
//         ws.close();
//         return;
//     }
//
//     // Store the WebSocket client with the user token as the key
//     clients.set(userToken, ws);
//
//     // Handle incoming WebSocket messages
//     ws.on('message', (message) => {
//         // Parse the message JSON
//         let parsedMessage;
//         try {
//             parsedMessage = JSON.parse(message);
//         } catch (error) {
//             console.error('Error parsing message:', error);
//             return;
//         }
//
//         // Check if the message includes the user token
//         const { userToken: messageToken, content } = parsedMessage;
//         if (messageToken !== userToken) {
//             console.error('Invalid user token in message');
//             return;
//         }
//
//         // Broadcast the message to all clients in the general room
//         wss.clients.forEach((client) => {
//             if (client !== wss && client.readyState === WebSocket.OPEN) {
//                 client.send(content);
//             }
//         });
//     });
//
//     // Handle WebSocket disconnection
//     ws.on('close', () => {
//         // Remove the WebSocket client from the map when disconnected
//         clients.delete(userToken);
//     });
// });

app.get('/', (req, res) => {
    res.send('WebSocket server is running');
});

server.listen(3000, () => {
    console.log('WebSocket server is listening on port 3000');
});