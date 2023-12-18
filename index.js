import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import fs from "fs";
import dotenv from "dotenv";
import hash from "hash.js";
import Client from "pg";

const config = dotenv.config().parsed;


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

class ServiceManger {
    // This class interacts with a service, gets the data from it, then stores it in the database, then sends it to ChatGPT
}

class Database {
    // This class interacts with the database
}

class ChatGPT {
    // This class interacts with ChatGPT
}

class Telegram {
    // This class interacts with Telegram
    static apiId = parseInt(config.API_ID);
    static apiHash = config.API_HASH;
    static client = null;

    constructor() {
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
            } else {
                stringSession = new StringSession("");
            }

            console.log("Connecting to Telegram...");
            Telegram.client = new TelegramClient(stringSession, Telegram.apiId, Telegram.apiHash, {
                connectionRetries: 5,
            });
            await Telegram.client.start({
                phoneNumber: async () => await input.text("Please enter your number: "),
                password: async () => await input.text("Please enter your password: "),
                phoneCode: async () => await input.text("Please enter the code you received: "),
                onError: (err) => console.log(err),

            });
            if (!Telegram.client.connected) await Telegram.client.connect();
            console.log("You should now be connected.");
            
            let sesh = Telegram.client.session.save(); // Save this string to avoid logging in again
            if(!fs.existsSync("session.txt")) fs.writeFileSync("session.txt",sesh);
            else if(fs.readFileSync("session.txt").toString() != sesh) fs.writeFileSync("session.txt",sesh);
        })();
    }

    async isValidPeer(peer) {
        // This function checks if a peer is valid
        if (!Telegram.client.connected) await Telegram.client.connect();
        let res = await Telegram.client.invoke(
            new Api.contacts.ResolveUsername({
                username: peer,
            })
        );
        return res.peer != null;
    }

    async getMessages(peer, limit, offset) {
        // This function gets messages from Telegram
        if (!Telegram.client.connected) await Telegram.client.connect();
        return await Telegram.client.invoke(
            new Api.messages.GetHistory({
                peer: peer,
                limit: limit,
                addOffset: offset,
            })
        );
    }

    async sendMessage(peer, message) {
        // This function sends a message to Telegram
        if (!Telegram.client.connected) await Telegram.client.connect();
        return await Telegram.client.invoke(
            new Api.messages.SendMessage({
                peer: peer,
                message: message,
            })
        );
    }

    isConnected() {
        // This function checks if Telegram is connected
        return Telegram.client.connected;
    }
}

class TelegramSource {
    // This class represents a telegram source
    constructor(peer, Telegram, Database) {
        this.peer = peer;
        this.telegram = Telegram;
        this.db = Database;
    }

    get ready() {
        return this.telegram.isValidPeer(this.peer) && this.telegram.isConnected();
    }

    async getDaysMessages(date) {
        // This function gets the messages from the source for the day
        if(!this.ready)return [];
        let result = await this.telegram.getMessages(this.peer, 5, 0);
        let getDate = new Date(date).setHours(0,0,0,0);
        let retMessages = [];
        result.messages.forEach(mes => {
            let messageDate = new Date(mes.date*1000).setHours(0,0,0,0);
            if(messageDate == getDate) retMessages.push(mes);
        });
        return retMessages;
    }
}

class NewsSiteSource {
    // This class represents a news source
}

class TwitterSource {
    // This class represents a twitter source
}

class RedditSource {
    // This class represents a reddit source
}

let db = new Database();
let telegram = new Telegram();
let S2UnderGround = new TelegramSource("S2UndergroundWire", telegram, db);
S2UnderGround.getDaysMessages(new Date().setDate(16).valueOf());