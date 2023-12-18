import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import fs from "fs";

const apiId = 29729100;
const apiHash = "f55a87980bdf6f05c82aa75417cf8aed";

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
        console.log("Session loaded: " + sesh_string);
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
    await client.connect();
    console.log("You should now be connected.");
    let sesh = client.session.save(); // Save this string to avoid logging in again
    console.log(sesh);
    fs.writeFileSync("session.txt", sesh);
    await client.sendMessage("me", { message: "Hello!" });
    console.log("Message should have been sent.");
    (async function run() {
        await client.connect(); // This assumes you have already authenticated with .start()

        const result = await client.invoke(
            new Api.channels.GetChannels({
                id: ["S2UndergroundWire"],
            })
        );
        // console.log(result); // prints the result
        const messages = await client.invoke(
            new Api.messages.GetHistory({
                peer: "S2UndergroundWire",
                limit: 10,
            })
        );
        console.log(messages); // prints the result
    })();
})();