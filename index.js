const express = require('express');
const http = require('http');
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
        const connection = await pool.getConnection();

        // Execute the SQL query
        const [rows] = await connection.execute(
            'SELECT u.username ' +
            'FROM users u ' +
            'INNER JOIN users_session us ON u.unique_id = us.user_uniqueid ' +
            'WHERE us.user_token = ?',
            [userToken]
        );
        connection.release();

        if (rows.length === 0) {
            return null;
        }

        return rows[0].username;
    } catch (error) {
        return null;
    }
}

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
app.get('/', (req, res) => {
    res.send('WebSocket server is running');
});

server.listen(3000, () => {
    console.log('WebSocket server is listening on port 3000');
});