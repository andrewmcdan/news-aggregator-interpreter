import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
// import input as any from "input";
const input: any = require("input");
import fs from "fs";
import dotenv from "dotenv";
const sha512: any = require("hash.js/lib/hash/sha/512.js");
const Client: any = require("pg");

// define config type with 

const config: any = dotenv.config().parsed;

// define Database type
interface Database {
    client: any;
    connected: boolean;
    connectingInProgress: boolean;
    connect(): Promise<void>;
    checkIfTableExists(tableName: string): Promise<boolean>;
    createTable(tableName: string): Promise<void>;
    checkIfHashExists(tableName: string, hash: string): Promise<boolean>;
    insertData(tableName: string, hash: string, data: string, date: string): Promise<void>;
}

// define ChatGPT type
interface ChatGPT {
    // This class interacts with ChatGPT
}

// define Telegram type
interface Telegram {
    client: any;
    apiId: number;
    apiHash: string;
    isValidPeer(peer: string): Promise<boolean>;
    getMessages(peer: string, limit: number, offset: number): Promise<any>;
    sendMessage(peer: string, message: string): Promise<any>;
    isConnected(): boolean;
}

// define Source type
interface Source {}


// define ServiceManger type
interface ServiceManger {
    db: Database;
    service: any;
    chatGPT: ChatGPT;
    startDate: Date;
    sources: any[];
    tableName: string;
    init(): void;
    createTableAndFill(): Promise<void>;
    fillTable(): Promise<void>;
}



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
    constructor(Database: Database, Service: Source, ChatGPT: ChatGPT) {
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
            console.log("Filling table for " + this.tableName + " on " + new Date(date));
            let data = await this.service.getDataForDate(date);
            
            if (typeof data == "string") data = [data];
            if (!Array.isArray(data)) {
                // recursively walk through data and the strings that are not empty are the data
                let dataArr = []as string[];
                const walk = (obj: any) => {
                    for (let key in obj) {
                        if (typeof obj[key] == "string") {
                            if (obj[key] != "") dataArr.push(obj[key]);
                        } else walk(obj[key]);
                    }
                }
                walk(data);
                data = dataArr;
            }
            for (const element of data) {
                let hash = sha512().update(element).digest('hex');
                if (!await this.db.checkIfHashExists(this.tableName, hash)) await this.db.insertData(this.tableName, hash, element, new Date(date).toLocaleString());
            }
            date = new Date(date.valueOf() - 1000 * 60 * 60 * 24);
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
                    resolve(void 0);
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

    async checkIfTableExists(tableName: string) {
        if (!this.connected) await this.connect();
        // This function checks if a table exists in the database
        let res = await this.client.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)", [tableName.toLowerCase()]);
        return res.rows[0].exists;
    }

    async createTable(tableName:string) {
        if (!this.connected) await this.connect();
        // This function creates a table in the database
        await this.client.query(`CREATE TABLE ${tableName} (hash TEXT PRIMARY KEY, data TEXT, date TIMESTAMP)`);
    }

    async checkIfHashExists(tableName: string, hash: string) {
        if (!this.connected) await this.connect();
        // This function checks if a hash exists in the database
        let res = await this.client.query(`SELECT EXISTS (SELECT FROM ${tableName} WHERE hash = $1)`, [hash]);
        return res.rows[0].exists;
    }

    async insertData(tableName:string, hash:string, data:string, date:string) {
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

class Telegram implements Source {
    // This class interacts with Telegram
    static apiId = parseInt(config.API_ID);
    static apiHash = config.API_HASH;
    static client: any;

    constructor() {
        (async () => {
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
                onError: (err: any) => console.log(err),

            });
            if (!Telegram.client.connected) await Telegram.client.connect();
            console.log("You should now be connected.");

            let sesh = Telegram.client.session.save(); // Save this string to avoid logging in again
            if (!fs.existsSync("session.txt")) fs.writeFileSync("session.txt", sesh);
            else if (fs.readFileSync("session.txt").toString() != sesh) fs.writeFileSync("session.txt", sesh);
        })();
    }

    async isValidPeer(peer: string) {
        // This function checks if a peer is valid
        if (!Telegram.client.connected) await Telegram.client.connect();
        let res = await Telegram.client.invoke(
            new Api.contacts.ResolveUsername({
                username: peer,
            })
        );
        return res.peer != null;
    }

    async getMessages(peer: string, limit: number, offset: number) {
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

    async sendMessage(peer: string, message: string) {
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
    // define TelegramSource type
    peer: string;
    telegram: Telegram;
    formatData: any;
    downloadedData: any[];
    foundEndOfHistory: boolean;
    // This class represents a telegram source
    constructor(Peer:string, Telegram:any, FormatData = (data:any) => { return data }) {
        this.peer = Peer;
        this.telegram = Telegram;
        this.formatData = FormatData;
        this.downloadedData = [];
        this.foundEndOfHistory = false;
    }

    async ready() {
        

        return await this.telegram.isValidPeer(this.peer) && this.telegram.isConnected();
    }

    get name() {
        return this.peer;
    }

    async getDataForDate(date: Date) {
        // This function gets the messages from the source for the day
        if (!this.ready) return [];
        let getDate = Math.floor(new Date(date).valueOf() / 1000);
        let messages = await this.getMessages(100, 0);
        if(messages.length < 100) {
            this.foundEndOfHistory = true;
        }
        let dateFound = false;
        let pastDate = false;
        let retMessages = [];
        let offset = 100;
        while (!dateFound && !pastDate) {
            for (const element of messages) {
                if (element.date == getDate) {
                    retMessages.push(element.message);
                    dateFound = true;
                }else if (element.date < getDate) {
                    pastDate = true;
                    break;
                }
            }
            if (messages[messages.length - 1]?.date < getDate || this.foundEndOfHistory) break;
            messages = await this.getMessages(100, offset);
            if (messages.length == 0) {
                this.foundEndOfHistory = true;
                break;
            }
            offset = offset + 100;
        }

        let retVal = [] as any[];
        retMessages.forEach(message => {
            let data = this.formatData(message);
            if (data != undefined) retVal.push(data);
        });
        return retVal;
    }

    async getMessages(limit:number, offset:number) {
        // This function gets messages from the source
        if (!this.ready) return [];
        let result = {
            // messages is an optional array
            messages: [] as any[]
        };
        console.log("Getting messages from Telegram for peer: " + this.peer, "limit: " + limit, "offset: " + offset, "downloadedData length: " + this.downloadedData.length)
        if (limit + offset > this.downloadedData.length && !this.foundEndOfHistory) {
            result = await this.telegram.getMessages(this.peer, limit, offset);
            if(result.messages.length == 0) this.foundEndOfHistory = true;
            this.downloadedData.push(...result.messages);
        } else {
            result.messages = [];
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
    let ret = {
        data: [] as any[]
    };
    ret.data = [] as any[];
    if (typeof textArr == "string") textArr = [textArr];
    textArr.forEach((text: string) => {
        if (text == undefined||text == ""||text == " "||text == null) return;
        // Splitting the text into metadata and data sections
        
        ret.data.push({ text });
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

async function waitSeconds(seconds: number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
} 