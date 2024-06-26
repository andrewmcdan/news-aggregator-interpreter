import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import fs from "fs";
import dotenv from "dotenv";
import sha512 from "hash.js/lib/hash/sha/512.js";
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
 *  - Have a chat thread where all the full updates from ChatGPT are sent to ChatGPT. ChatGPT should then give a brief summary of that full report and then give a full update on whats happening in the world.
 * 
 * 
 */

class ServiceManger {
    // This class interacts with a service, gets the data from it, then stores it in the database, then sends it to ChatGPT

    // config.startDate will be the earliest date to get data from the various sources
    // First, we need to check the database to see if the source has a table in the database
    // If it does, we assume that the data has already been collected going back to the startDate
    // If it doesn't, we need to get the data from the source going back to the startDate
    constructor(Database, Service, ChatGPT) {
        this.db = Database;
        this.service = Service;
        this.chatGPT = ChatGPT;
        this.startDate = config.START_DATE;
        this.sources = [];
        this.tableName = this.service.name;
        this.init();
    }

    async init() {
        // This function initializes the ServiceManager
        if (!await this.db.checkIfTableExists(this.tableName)) await this.createTableAndFill();
        await this.fillTable(); //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// debug
    }

    async createTableAndFill() {
        // This function creates the table for the service and fills it with data
        await this.db.createTable(this.tableName);
        await this.fillTable();
    }

    async fillTable() {
        // This function fills the table with data
        let fillStartDate = new Date(this.startDate);
        let date = new Date();
        console.log({ fillStartDate });
        while (fillStartDate < date) {
            let data = await this.service.getDataForDate(date);
            // console.log("typeof data: " + typeof data);
            if (typeof data == "string") data = [data];
            if (!Array.isArray(data)) {
                // recursively walk through data and the strings that are not empty are the data
                let dataArr = [];
                const walk = (obj) => {
                    for (let key in obj) {
                        if (typeof obj[key] == "string") {
                            if (obj[key] != "") dataArr.push(obj[key]);
                        } else walk(obj[key]);
                    }
                }
                walk(data);
                data = dataArr;
            }
            for (let i = 0; i < data.length; i++) {
                let hash = sha512().update(data[i]).digest('hex');
                if (!await this.db.checkIfHashExists(this.tableName, hash)) await this.db.insertData(this.tableName, hash, data[i], new Date(date).toLocaleString());
            }
            date = date - 1000 * 60 * 60 * 24;
        }
    }
}

class Database {
    // This class interacts with the database
    constructor() {
        this.client = new Client.Client({
            user: config.DB_USER,
            host: config.DB_HOST,
            database: config.DB_NAME,
            password: config.DB_PASS,
            port: config.DB_PORT,
        });
        this.connected = false;
        this.connectingInProgress = false;
        this.connect();

    }

    async connect() {
        // This function connects to the database
        if (this.connectingInProgress) return new Promise(resolve => {
            let interval = setInterval(() => {
                if (this.connected) {
                    resolve();
                    clearInterval(interval);
                }
            }, 100);
        });
        this.connectingInProgress = true;
        while (!this.connected) {
            try {
                await this.client.connect();
                this.connected = true;
            } catch (e) {
                console.log("Error connecting to database: " + e);
                await waitSeconds(5);
            }
        }
        this.connectingInProgress = false;
    }

    async checkIfTableExists(tableName) {
        if (!this.connected) await this.connect();
        // This function checks if a table exists in the database
        let res = await this.client.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)", [tableName.toLowerCase()]);
        return res.rows[0].exists;
    }

    async createTable(tableName) {
        if (!this.connected) await this.connect();
        // This function creates a table in the database
        await this.client.query(`CREATE TABLE ${tableName} (hash TEXT PRIMARY KEY, data TEXT, date TIMESTAMP)`);
    }

    async checkIfHashExists(tableName, hash) {
        if (!this.connected) await this.connect();
        // This function checks if a hash exists in the database
        let res = await this.client.query(`SELECT EXISTS (SELECT FROM ${tableName} WHERE hash = $1)`, [hash]);
        return res.rows[0].exists;
    }

    async insertData(tableName, hash, data, date) {
        if (!this.connected) await this.connect();
        if (typeof data != "string") data = JSON.stringify(data, null, 2);
        // This function inserts data into the database
        await this.client.query(`INSERT INTO ${tableName} (hash, data, date) VALUES ($1, $2, $3)`, [hash, data, date]);
    }
}

class ChatGPT {
    // This class interacts with ChatGPT
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//#region Interfaces with various services

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
            if (!fs.existsSync("session.txt")) fs.writeFileSync("session.txt", sesh);
            else if (fs.readFileSync("session.txt").toString() != sesh) fs.writeFileSync("session.txt", sesh);
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
        // console.log("Getting messages from Telegram for peer: " + peer, "limit: " + limit, "offset: " + offset)
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

//#endregion ////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//#region Sources

class TelegramSource {
    // This class represents a telegram source
    constructor(Peer, Telegram, FormatData = (data) => { return data }) {
        this.peer = Peer;
        this.telegram = Telegram;
        this.formatData = FormatData;
        this.downloadedData = [];
    }

    get ready() {
        return this.telegram.isValidPeer(this.peer) && this.telegram.isConnected();
    }

    get name() {
        return this.peer;
    }

    async getDataForDate(date) {
        // This function gets the messages from the source for the day
        if (!this.ready) return [];
        let getDate = new Date(date).setHours(0, 0, 0, 0);
        let messages = await this.getMessages(100, 0);
        let dateFound = false;
        let retMessages = [];
        let offset = 0;
        while (!dateFound) {
            for (let i = 0; i < messages.length; i++) {
                let messageDate = new Date(messages[i].date * 1000).setHours(0, 0, 0, 0);
                if (messageDate == getDate) {
                    retMessages.push(messages[i].message);
                    dateFound = true;
                }
            }
            if (messages[messages.length - 1]?.date < getDate) break;
            messages = await this.getMessages(100, offset += 100);
        }

        // console.log(`got ${retMessages.length} messages for ${this.peer} on ${new Date(date).toDateString()}`);
        let retVal = [];
        retMessages.forEach(message => {
            let data = this.formatData(message);
            if (data != undefined) retVal.push(data);
        });
        return retVal;
    }

    async getMessages(limit, offset) {
        // This function gets messages from the source
        if (!this.ready) return [];
        let result = {};
        // console.log("Getting messages from Telegram for peer: " + this.peer, "limit: " + limit, "offset: " + offset, "downloadedData length: " + this.downloadedData.length)
        if (limit + offset > this.downloadedData.length + offset) {
            result = await this.telegram.getMessages(this.peer, limit, offset);
            this.downloadedData = result.messages;
        } else {
            result.messages = this.downloadedData.slice(offset, limit + offset);
        }
        return result.messages;
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

class RSSFeedSource {
    // This class represents an RSS feed source
}

//#endregion ///////////////////////////////////////////////////////////////////////////////////////////////////

const db = new Database();
const telegram = new Telegram();
const chatGPT = new ChatGPT();
const s2UnderGround = new TelegramSource("S2UndergroundWire", telegram, (textArr) => {
    let ret = {};
    ret.data = [];
    if (typeof textArr == "string") textArr = [textArr];
    textArr.forEach(text => {
        if (text == undefined||text == ""||text == " "||text == null) return;
        // Splitting the text into metadata and data sections
        const [metadataText, , dataText, , endData] = text.split("-----");
        if (metadataText == undefined||metadataText == null||dataText == undefined||dataText == null) return;
        // Extracting metadata
        const metadata = metadataText.trim().split("\n").reduce((acc, line) => {
            let [key, value] = line.split(":").map(s => s.trim());
            acc[key] = value;
            return acc;
        }, {});
        // Function to extract subsections and embedded analyst comments
        const extractSection = (sectionText) => {
            if (sectionText == undefined||sectionText == null) return;
            let sectionLines = sectionText.split(/(\n|(AC:))/mg);
            for (let i = sectionLines.length - 1; i > 0; i--) {
                if (sectionLines[i - 1]?.includes("AC:")) {
                    sectionLines[i] = sectionLines[i - 1] + sectionLines[i];
                    sectionLines[i - 1] = "";
                    sectionLines[i - 2] = "";
                    i -= 2;
                }
            }
            const sectionData = [];
            let comments = [];
            sectionLines.forEach(line => {
                if (line == undefined||line == null||line == ""||line == " "||line == '\n'||line.match(/-[a-zA-Z]+\s[a-zA-Z]+-/g)) return;
                if (line.startsWith("AC:")) {
                    sectionData.push({ "analystComment": line.slice(3).trim() });
                    comments.push(line.slice(3).trim());
                } else sectionData.push({ "content": line.trim() });

            });
            if (comments.length > 0 && sectionText.includes("-Analyst Comments-")) sectionData.push({ "analystComments": comments });
            return sectionData;
        }
        // Extracting data sections
        let sections = dataText.split(/((-[a-zA-Z]+\s[a-zA-Z]+-)(\n[\s\S]*?)*(?=-[a-zA-Z]+\s[a-zA-Z]+-|$))/gm);
        const data = {
            internationalEvents: extractSection(sections.find(section => section.includes("-International Events-"))),
            homefront: extractSection(sections.find(section => section.includes("-Homefront-"))),
            analystComments: extractSection(sections.find(section => section.includes("-Analyst Comments-")))
        };
        // Constructing the JSON object
        ret.data.push({ metadata, data });
    });
    return JSON.stringify(ret, null, 2);
});

let services = [
    new ServiceManger(db, s2UnderGround, chatGPT)
];


//#region testing
// (async () => {
//     await waitSeconds(3);
//     s2UnderGround.getDataForDate(new Date().setDate(15));
// })();
//#endregion

async function waitSeconds(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
} 