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
    host: 'db-mysql-fra1-25366-do-user-14765642-0.b.db.ondigitalocean.com',
    user: 'doadmin',
    password: 'AVNS_AlOR6j8FxABOCrAM0b4',
    database: 'twchatextended',
    port: 25060,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const MESSAGE_EXPIRY_TIME_MS = 30000;
const TRUNCATE_TABLE_TIME_MS = 3000000;

// Function to remove expired messages from recentMessages set
function cleanupRecentMessages() {
    recentMessages.forEach((message) => {
        if (Date.now() - message.messageTime > MESSAGE_EXPIRY_TIME_MS) {
            recentMessages.delete(message);
        }
    });
}

async function truncateTable() {
    try {
        const connection = await pool.getConnection();
        await connection.execute(`TRUNCATE TABLE chat`);
        console.log("Truncated table chat");
        connection.release();
    } catch (error) {
        console.error(error);
    }
}

const recentMessages = new Set();

// Set up a timer to clean up expired messages periodically
setInterval(cleanupRecentMessages, MESSAGE_EXPIRY_TIME_MS);
setInterval(truncateTable, TRUNCATE_TABLE_TIME_MS);

const getMessagesForWorldAndTown = async (world, town) => {
    try {
        const connection = await pool.getConnection();

        // Execute the SQL query
        const [rows] = await connection.execute(
            'SELECT sender, message, created_at ' +
            'FROM chat ' +
            'WHERE world = ? AND town = ? ORDER BY created_at ASC',
            [world, town]
        );
        connection.release();

        return {"messages":rows, "length": rows.length};
    } catch (error) {
        return null;
    }
}
const saveMessageToDb = async (msg, world, town, player_name) => {
    try {
        const connection = await pool.getConnection();
        await connection.execute(`INSERT INTO chat (sender, message, world, town) VALUES (?, ?, ?, ?)`, [player_name, msg, world, town]);
        connection.release();
    } catch (error) {
        console.error(error);
    }
}

let playerToWorldTown = {};

// Function to associate a player with a world and town
function connectPlayerToWorldTown(playerName, worldName, town) {
    playerToWorldTown[playerName] = { world: worldName, town: town };
}

// Function to retrieve the world and town associated with a player
function getWorldTownForPlayer(playerName) {
    return playerToWorldTown[playerName];
}

// Function to get all players in a specific world and town
function getPlayersInWorldAndTown(worldName, town) {
    let playersInWorldAndTown = [];
    for (let playerName in playerToWorldTown) {
        if (
            playerToWorldTown.hasOwnProperty(playerName) &&
            playerToWorldTown[playerName].world === worldName &&
            playerToWorldTown[playerName].town === town
        ) {
            playersInWorldAndTown.push(playerName);
        }
    }
    return playersInWorldAndTown;
}

function deletePlayerFromWorldAndTown(playerName, worldName, town) {
    for (let key in playerToWorldTown) {
        if (playerToWorldTown.hasOwnProperty(key)) {
            let player = playerToWorldTown[key];
            if (key === playerName && player.world === worldName && player.town === town) {
                delete playerToWorldTown[key];
                console.log("Player", playerName, "in World", worldName, "Town", town, "deleted.");
                break;
            }
        }
    }
}

//	"id": "TellReceived" -> ked niekto whisperne
// v skripte umoznit vytvorit roomku podla mena, poslat notifikaciu ked ti niekto whisperne v hre na mobil


io.on('connection', async (socket) => {
    console.log("connected");
    const loginHash = socket.handshake.query.loginHash;
    console.log(loginHash);
    let parsed;
    let isVerified = false;
    let gameWorld = null;
    let player_name = null;
    let town = null;
    try{
        parsed = loginHash.split(":");
        isVerified = parsed[3] !== undefined;
        gameWorld = parsed[0] ?? null;
        player_name = parsed[1] ?? null;
        town = parsed[2] ?? null;
    } catch (e) {
        console.log(e);
        io.to(socket.id).emit("badCredentials");
    }
    let clientRoom;
    if(gameWorld == null || player_name == null || town == null) {
        io.to(socket.id).emit("badCredentials");
    } else {
        clientRoom = gameWorld+"_"+town;
        socket.join(clientRoom);
        io.sockets.in(clientRoom).emit('connectToRoom', `${player_name}${isVerified ? ` [✔]` : ``} has joined the room. [World: ${gameWorld}, Town: ${town}]`);
        connectPlayerToWorldTown(`${player_name}${isVerified ? ` [✔]` : ``}`.toString(), gameWorld, town);
        io.sockets.in(clientRoom).emit('connectRoomConnectedUsers', getPlayersInWorldAndTown(gameWorld, town));
        let worldMessages = await getMessagesForWorldAndTown(gameWorld, town);
        io.to(socket.id).emit("twchatCachedMessages", worldMessages);
    }


    socket.on('disconnect', () => {
        deletePlayerFromWorldAndTown(`${player_name}${isVerified ? ` [✔]` : ``}`.toString(), gameWorld, town);
        io.sockets.in(clientRoom).emit('connectRoomDisconnectedUsers', JSON.stringify({"player_name":`${player_name}${isVerified ? ` [✔]` : ``}`.toString(), "players":getPlayersInWorldAndTown(gameWorld, town)}));
        console.log('user disconnected');
    });

    socket.on('twChat', async (msg) => {
        if (!recentMessages.has(msg)){
            recentMessages.add(msg);
            msg = JSON.parse(msg);
            await saveMessageToDb(msg.message, gameWorld, town, msg.sender);
            io.to(clientRoom).emit('twChatResend', msg);
        }
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