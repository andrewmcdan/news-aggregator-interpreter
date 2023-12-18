import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import fs from "fs";
import dotenv from "dotenv";
import hash from "hash.js";
import Client from "pg";

const config = dotenv.config().parsed;
const apiId = parseInt(config.API_ID);
const apiHash = config.API_HASH;

(async () => {
    console.log("Loading interactive example...");
    let stringSession = null;
    if (fs.existsSync("session.txt")) {
        console.log("Loading saved session...");
        let sesh_string = fs.readFileSync("session.txt").toString();
        try {
            stringSession = new StringSession(sesh_string);
        } catch (e) {
            console.log("Error loading session: " + e);
            stringSession = new StringSession("");
        }
        // console.log("Session loaded: " + sesh_string);
    } else {
        stringSession = new StringSession("");
    }

    console.log("Connecting to Telegram...");
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });
    await client.start({
        phoneNumber: async () => await input.text("Please enter your number: "),
        password: async () => await input.text("Please enter your password: "),
        phoneCode: async () => await input.text("Please enter the code you received: "),
        onError: (err) => console.log(err),

    });
    if (!client.connected) await client.connect();
    console.log("You should now be connected.");
    let sesh = client.session.save(); // Save this string to avoid logging in again
    console.log(sesh);
    fs.writeFileSync("session.txt", sesh);
    await client.sendMessage("me", { message: "Hello!" });
    console.log("Message should have been sent.");
    (async function run() {
        if (!client.connected) await client.connect();

        let result = await client.invoke(
            new Api.channels.GetChannels({
                id: ["S2UndergroundWire"],
            })
        );
        // console.log(result);

        const user_me = await client.invoke(
            new Api.users.GetUsers({
                id: ["me"],
            })
        );
        // console.log(user_me);

        result = await client.invoke(
            new Api.messages.SendMessage({
                peer: "NewsAggregateAI481",
                message: "Hello!",
            })
        );
        console.log(result);
        const S2UndergroundWire_history = await client.invoke(
            new Api.messages.GetHistory({
                peer: "S2UndergroundWire",
                limit: 10,
            })
        );
        let hashes = [];
        S2UndergroundWire_history.messages.forEach(mes => {
            hashes.push(hash.sha512().update(mes.message).digest('hex'));
            console.log(mes.message);
        });
        console.log(hashes);
        // TODO: Add database stuff: check if hashes are in database, if not, add them and their respective messages
    })();
})();

/**
 * 
 * Program structure:
 *  - Connect to Telegram and other services
 *  - Get messages from Telegram, articles, etc.
 *  - Store messages, articles, etc in database (if not already stored) using hash of message/article as key
 *  - Have a thread with ChatGPT for each news source where each time a new message appears in that news source, it is sent to ChatGPT and the response is sent to the User
 *      - The data from the news source should also be sent to ChatGPT for summary generation. That way ChatGPT can give a brief summary of the news source before giving a full update on the news source.
 *  - Have a thread where all the full updates from ChatGPT are to ChatGPT. ChatGPT should then give a brief summary of that full report and then give a full update on whats happening in the world.
 * 
 * 
 */