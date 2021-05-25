const fs = require("fs");
let config = JSON.parse(fs.readFileSync(__dirname + '/../config/configuration.json', 'utf-8'));
const TelegramBot = require('node-telegram-bot-api');
const token = config["telegram_api"];
const bot = new TelegramBot(token, { polling: true });
const axios = require("axios").default;
var path = require('path')
const { exec } = require("child_process");
const lineReader = require('line-reader');

let expectedWord = "";
let series = 1;

function execShellCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.warn(error);
            }
            resolve();
        });
    });
}


bot.onText(/\/populate/, (msg, match) => {
    const chatId = msg.chat.id;
    let audiodir = fs.readdirSync("audio");
    lineReader.eachLine('dictionary/italian.txt', (line) => {
        console.log(line);
        let files = audiodir.filter((x) => x.startsWith(line));
        if (files.length == 0) {
            expectedWord = line;
            bot.sendMessage(chatId, "Inviami una nota vocale con la parola: " + expectedWord);
            return false;
        }
    });
});

bot.onText(/\/redo (.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    expectedWord = match[1];
    bot.sendMessage(chatId, "Inviami una nota vocale con la parola: " + expectedWord);

});

bot.on('voice', (msg) => {
    const chatId = msg.chat.id;
    if (expectedWord == "") {
        bot.sendMessage(chatId, "No expected word");
    } else {
        bot.getFileLink(msg.voice.file_id).then((url) => {
            let extension = path.extname(url);
            axios.get(url, {
                responseType: "stream"
            }).then((res) => {
                res.data.pipe(fs.createWriteStream("audio/" + expectedWord + extension));
                bot.sendMessage(chatId, "Parola Salvata");
                expectedWord = "";
                //Trim silence at the original file
                //let command = `ffmpeg -i audio/${expectedWord+extension} -af silenceremove=start_periods=1:stop_periods=1:detection=peak audio/${expectedWord}.mp3`;
                //execShellCommand(command).then(() => {
                //    fs.rmSync(`audio/${expectedWord+extension}`);
                //});

            })
        });
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    let usr = msg.from.username || msg.from.first_name
    if (msg.hasOwnProperty("text") && !msg.text.startsWith("/")) {
        console.log("[" + msg.date + "] " + "[ChatID: " + chatId + "] [IdUser: " + msg.from.id + "] [Username: " + usr + "] has sent: " + msg.text)
        let words = msg.text.toLowerCase().split(" ");
        let audio = [];
        let missing_world = [];
        for (let i = 0; i < words.length; i++) {
            let files = fs.readdirSync("audio").filter((x) => x.split(".")[0] == words[i]);
            if (files.length > 0) {
                audio.push("audio/" + files[0]);
            } else {
                missing_world.push({
                    text: words[i],
                    callback_data: words[i]
                })
            }
        }
        if (missing_world.length == 0 && audio.length != 0) {
            let command = 'ffmpeg -y -i concat:"' + audio.join('|') + '" -acodec mp3 temp.mp3 && sox temp.mp3 out.mp3 silence 1 0.1 1% -1 0.5 1%';
            //Ignore Silence
            execShellCommand(command).then((x) => {
                bot.sendVoice(chatId, "out.mp3").then((x) => {
                    fs.rmSync("temp.mp3");
                    fs.rmSync("out.mp3");
                });
            });
        } else {
            let inline_keyboard = [missing_world];
            bot.sendMessage(chatId, "Clicca la parola se la vuoi aggiungere al database", {
                reply_markup: {
                    inline_keyboard
                }
            });
        }
    }
});

bot.on('callback_query', query => {
    const chatId = query.message.chat.id;
    expectedWord = query.data

    bot.answerCallbackQuery(query.id).then(() => {
        bot.sendMessage(chatId, "Inviami una nota vocale con la parola: " + expectedWord);
    });
});