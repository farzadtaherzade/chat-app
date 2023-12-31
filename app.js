require("dotenv").config();
const Redis = require("ioredis");
const express = require("express");

const app = express();

const { createServer } = require("http");
const { Server } = require("socket.io");
app.set("view engine", "ejs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const users = [];
const client = new Redis(process.env.REDIS_URL);

const server = createServer(app);
app.get("/", async (req, res, next) => {
  const { username } = req.query;
  if (!username) return res.redirect("/login");

  const context = {
    username,
  };
  res.render("chat", context);
});

app.get("/login", (req, res, next) => {
  console.log(process.env.REDIS_URL);
  res.render("login");
});

app.get("/register", (req, res, next) => {
  res.render("register");
});

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const sendAllMessages = async ({ socket }) => {
  let messages = await client.lrange("messages", 0, -1);
  let rooms = Array.from(socket.rooms);
  let alreadyPrintFromRooms = 0;

  for (let i = 0; i < messages.length; i++) {
    let [username, message, room] = messages[i].split("#");
    room = String(room);
    if (rooms.includes(room)) {
      socket.to(rooms[0]).emit("serveMessages", message, username);
      alreadyPrintFromRooms++;
    } else if (room == "undefined") {
      if (alreadyPrintFromRooms <= 0 && rooms.length !== 2) {
        socket.emit("serveMessages", message, username);
      }
    }

    if (i == messages.length) {
      alreadyPrintFromRooms = 0;
    }
  }
};

io.on("connection", async (socket) => {
  socket.emit("welcome", "welcome");
  socket.on("login", (user) => {
    users.push(user);
  });
  await sendAllMessages({ socket });
  socket.on("message", async (message, room, username) => {
    if (room) {
      io.sockets.to(room).emit("serveMessages", message, username);
    } else {
      io.sockets.emit("serveMessages", message, username);
      room = undefined;
    }
    await client.rpush("messages", `${username}#${message}#${room}`);
  });
  socket.on("join-room", async (room, cb) => {
    socket.join(room);
    cb(`Joined ${room}`);
    await sendAllMessages({ socket });
  });
  socket.on("leave-room", (room) => {
    socket.leave(room);
  });
});

server.listen(3000, () =>
  console.log(`server running at ${process.env.SOCKET_URL}`)
);
