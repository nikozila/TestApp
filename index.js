const { Telegraf } = require('telegraf');
const express = require('express');
const DB = require('./db');
const expressApp = express();

const TOKEN = process.env.TEL_TOKEN;
const URL = 'https://footballbetapp.onrender.com';
// const URL = 'https://f9ebc4f00be7.ngrok.io';
const bot = new Telegraf(TOKEN);

const PORT = process.env.PORT || 433;

// bot.telegram.deleteWebhook();
// bot.telegram.setWebhook(`${URL}/bot${TOKEN}` , {
//     source: './certs/crt.pem'
// });
expressApp.use(bot.webhookCallback(`/bot${TOKEN}`));

expressApp.get('/', (req, res) => {
    res.send(`Hello World!`);
});
expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


bot.launch();

startPolling();

async function startPolling() {
    try {
        await bot.telegram.deleteWebhook();
        await bot.startPolling();
    } catch(e) {
        console.log('Polling Error', e.message);
    }
}

const TASKS = {
    CREATE_NEW_GAME: '0',
    SET_GAME_AS_BEGIN: '1',
    SET_GAME_AS_FINISHED: '2',
    BETTING: '3',
}

const data = {

};

bot.command('start', async ctx => {
    console.log('--ON START');
    const username = ctx.from.username;
    
    try {
        await DB.newUser(username);

        if (!data.hasOwnProperty(username)) {
            data[username] = {
                task: null,
            };
        }

        bot.telegram.sendMessage(ctx.chat.id, `Hello ${ctx.from.username}, Click /menu`, {});
    } catch(e) {
        console.log('eror: ', e);
        bot.telegram.sendMessage(ctx.chat.id, `Error initializing user, Click /start again.`, {});
    }
});

bot.command('cancel', async ctx => {
    console.log('--ON CANCEL');
    const username = ctx.from.username;

    if (data[username]) {
        data[username] = {};
    }

    bot.telegram.sendMessage(ctx.chat.id, 'Cancelled!', mainMenu);
});

bot.command('menu', (ctx) => {
    const username = ctx.from.username;
    const id = ctx.chat.id;
    if (!validateUserName(username)) {
        return sendStartAgainMessage(id);
    }
    
    bot.telegram.sendMessage(id, 'Menu:', mainMenu);
});

bot.command('quit', (ctx) => {
    // Explicit usage
    ctx.telegram.leaveChat(ctx.message.chat.id)
  
    // Using context shortcut
    ctx.leaveChat()
});

function creatingNewGame(id, username) {
    console.log('--Create New Match');
    if (!validateUserName(username)) {
        return sendStartAgainMessage(id);
    }

    data[username].task = TASKS.CREATE_NEW_GAME;

    bot.telegram.sendMessage(id, 'Enter First Team Name: (/cancel)', {});
}

async function gameStarted(id, username) {
    console.log('--Match Started');
    if (!validateUserName(username)) {
        return sendStartAgainMessage(id);
    }

    try {
        const matches = await DB.getNotStartedMatches();
        if (matches.length) {
            data[username].task = TASKS.SET_GAME_AS_BEGIN;
            bot.telegram.sendMessage(id, 'Which Match? (/cancel)', {
                "reply_markup": {
                    keyboard: matches.map(match => [{text: `${match.id}_${match.team1}-${match.team2}`}])
                }
            });    
        } else {
            bot.telegram.sendMessage(id, 'No Match Available', mainMenu);
        }
    } catch(e) {
        bot.telegram.sendMessage(id, 'Error during "match started", Plz try again."', mainMenu);
    }

    
}

async function gameFinished(id, username) {
    console.log('--Match Finished');
    if (!validateUserName(username)) {
        return sendStartAgainMessage(id);
    }

    try {
        const matches = await DB.getStartedMatches();
        if (matches.length) {
            data[username].task = TASKS.SET_GAME_AS_FINISHED;
            bot.telegram.sendMessage(id, 'Which Match? (/cancel)', {
                "reply_markup": {
                    keyboard: matches.map(match => [{text: `${match.id}_${match.team1}-${match.team2}`}])
                }
            });    
        } else {
            bot.telegram.sendMessage(id, 'No Match Available', mainMenu);    
        }
    } catch(e) {
        bot.telegram.sendMessage(id, 'Error during "match finished", Plz try again."', mainMenu);
    }

    

}

async function letsBet(id, username) {
    console.log('--Start Betting');
    if (!validateUserName(username)) {
        return sendStartAgainMessage(id);
    }

    try {
        const matches = await DB.getNotStartedMatches();
        if (matches.length) {
            data[username].task = TASKS.BETTING;
            bot.telegram.sendMessage(id, 'Which Match? (/cancel)', {
                "reply_markup": {
                    keyboard: matches.map(match => [{text: `${match.id}_${match.team1}-${match.team2}`}])
                }
            });    
        } else {
            bot.telegram.sendMessage(id, 'No Match Available', mainMenu);
        }
    } catch(e) {
        bot.telegram.sendMessage(id, 'Error during "lets bet", Plz try again."', mainMenu);
    }
}

async function showUsersRank(id) {
    try {
        const users = await DB.getUsersRank();
        const usersRank = users.map(user => `${user.username}: ${user.score}`);
        bot.telegram.sendMessage(id, usersRank.join('\n'), mainMenu);
    } catch(e) {
        bot.telegram.sendMessage(id, 'Error during "Show Rank", Plz try again."', mainMenu);
    }
}


bot.on('text', async (ctx) => {
    const username = ctx.from.username;
    const msg = ctx.message.text;
    const id = ctx.chat.id;

    if (!validateUserName(username)) {
        return sendStartAgainMessage(id);
    }

    switch (msg) {
        case 'New Match':
            return creatingNewGame(id, username);
        case 'Match Started':
            return gameStarted(id, username);
        case 'Match Finished':
            return gameFinished(id, username);
        case "Let's Bet!":
            return letsBet(id, username);
        case "Users Rank":
            return showUsersRank(id);
    }

    try {
        if (data[username].task == TASKS.CREATE_NEW_GAME) {
            if (data[username].team2) {
                //GETTING IF IS GROUP OR NOT
                data[username].is_group = msg === 'Yes' ? true : false;
                console.log(data[username]);
                await DB.newMatch(data[username].team1, data[username].team2, data[username].is_group);
                data[username] = {};
                bot.telegram.sendMessage(id, 'Done, you can use /menu again.', mainMenu);
            
            } else if (data[username].team1) {
                //GETTING Group Stage
                data[username].team2 = msg;
                bot.telegram.sendMessage(id, 'Group Stage? (/cancel)', {
                    "reply_markup": {
                        keyboard: [
                            [{text: "Yes"}],
                            [{text: "No"}],
                        ]
                    }
                });
                data[username].is_group = true;
    
            } else {
                //GETTING TEAM 2
                data[username].team1 = msg;
                bot.telegram.sendMessage(id, 'Enter Second Team Name: (/cancel)', {});
    
            }
        }
    
    
        if (data[username].task == TASKS.SET_GAME_AS_BEGIN) {
            const matchId = msg.split('_')[0];
            const teams = msg.split('_')[1];
            const team1 =  teams.split('-')[0];
            const team2 =  teams.split('-')[1];
            await DB.setGameAsStarted(matchId);
            const result = await DB.getUsersPrediction(matchId);
            data[username] = {};
            bot.telegram.sendMessage(id, `Match: ${team1}-${team2} just started.\nPredictions:\n---\n${result.join('\n---\n')}`, mainMenu);
        }
    
        
        if (data[username].task == TASKS.SET_GAME_AS_FINISHED) {
            if (!data[username].match) {
                const matchId = msg.split('_')[0];
                const match = await DB.getMatchById(matchId);
                data[username].match = match;
            }
            
            const matchId = data[username].match.id;
            const team1 = data[username].match.team1;
            const team2 = data[username].match.team2;
    
            if (data[username].team2_goals != undefined) {
                const won = msg;
                let winner = '';  
                if (won == team1) {
                    winner = 'team1';
                } else {
                    winner = 'team2';
                }
                const team1Goals = data[username].team1_goals;
                const team2Goals = data[username].team2_goals;
                await DB.setGameAsFinished(matchId, team1Goals, team2Goals, winner, data[username].match.is_group);
                const result = await DB.getUsersPrediction(matchId);
                data[username] = {};
                bot.telegram.sendMessage(id, `Match finished, ${team1} ${team1Goals} - ${team2Goals} ${team2} , ${won} won.\nPredictions:\n---\n${result.join('\n---\n')}`, mainMenu);
            } else if (data[username].team1_goals != undefined) {
                data[username].team2_goals = Number(msg);
                
                if (data[username].team1_goals == data[username].team2_goals && !data[username].match.is_group) {
                    bot.telegram.sendMessage(id, `Which team won? (/cancel)`, {
                        "reply_markup": {
                            keyboard: [
                                [{text: team1}],
                                [{text: team2}],
                            ]
                        }
                    });
                } else {
                    let winner = null;
                    if (data[username].team1_goals > data[username].team2_goals) {
                        winner = 'team1';
                    } else if (data[username].team1_goals < data[username].team2_goals) {
                        winner = 'team2';
                    }
                    const team1Goals = data[username].team1_goals;
                    const team2Goals = data[username].team2_goals;
                    await DB.setGameAsFinished(matchId, team1Goals, team2Goals, winner, data[username].match.is_group);
                    const result = await DB.getUsersPrediction(matchId);
                    data[username] = {};
                    bot.telegram.sendMessage(id, `Match finished, ${team1} ${team1Goals} - ${team2Goals} ${team2}.\nPredictions:\n---\n${result.join('\n----\n')}`, mainMenu);
                }
            } else if (data[username].getting_goals) {
                data[username].team1_goals = Number(msg);
                bot.telegram.sendMessage(id, `How many goals ${team2} scored? (/cancel)`, {});
            } else {
                //GETTING TEAM 1 GOALS
                data[username].getting_goals = true;
                bot.telegram.sendMessage(id, `How many goals ${team1} scored? (/cancel)`, {});
            }
    
        }
    
    
        if (data[username].task == TASKS.BETTING) {
            if (!data[username].bet_match) {
                const matchId = msg.split('_')[0];
                const match = await DB.getMatchById(matchId);
                data[username].bet_match = match;
            }
            
            const matchId = data[username].bet_match.id;
            const team1 = data[username].bet_match.team1;
            const team2 = data[username].bet_match.team2;
    
            if (data[username].prediction_team2_goals != undefined) {
                const won = msg;
                let winner = '';  
                if (won == team1) {
                    winner = 'team1';
                } else {
                    winner = 'team2';
                }
                const team1Goals = data[username].prediction_team1_goals;
                const team2Goals = data[username].prediction_team2_goals;
                await DB.bet(matchId, team1Goals, team2Goals, winner, username);
                data[username] = {};
                bot.telegram.sendMessage(id, `Thank you, ${team1} ${team1Goals} - ${team2Goals} ${team2}, ${won} wins.`, mainMenu);
            } else if (data[username].prediction_team1_goals != undefined) {
                data[username].prediction_team2_goals = Number(msg);
                if (data[username].prediction_team2_goals == data[username].prediction_team1_goals && !data[username].bet_match.is_group) {
                    bot.telegram.sendMessage(id, `Which team wins? (/cancel)`, {
                        "reply_markup": {
                            keyboard: [
                                [{text: team1}],
                                [{text: team2}],
                            ]
                        }
                    });
                } else {
                    let winner = null;
                    const team1Goals = data[username].prediction_team1_goals;
                    const team2Goals = data[username].prediction_team2_goals;
                    if (team1Goals > team2Goals) {
                        winner = 'team1';
                    } else if (team1Goals < team2Goals) {
                        winner = 'team2';
                    }
                    await DB.bet(matchId, team1Goals, team2Goals, winner, username);
                    data[username] = {};
                    bot.telegram.sendMessage(id, `Thank you, ${team1} ${team1Goals} - ${team2Goals} ${team2}`, mainMenu);
                }
    
    
    
            } else if (data[username].prediction_getting_goals) {
                data[username].prediction_team1_goals = Number(msg);
                bot.telegram.sendMessage(id, `How many goals ${team2} will score? (/cancel)`, {});
            } else {
                data[username].prediction_getting_goals = true;
                bot.telegram.sendMessage(id, `How many goals ${team1} will score? (/cancel)`, {});
            }
    
        }
    } catch(e) {
        console.log('Err msg: ', e.message);
        bot.telegram.sendMessage(id, `Error with code ${data[username].task}, Plz try again."`, mainMenu);
    }

    

    
});

// bot.launch()

// Enable graceful stop
// process.once('SIGINT', () => bot.stop('SIGINT'))
// process.once('SIGTERM', () => bot.stop('SIGTERM'))


function validateUserName(username) {
    return data.hasOwnProperty(username);
}


function sendStartAgainMessage(id) {
    bot.telegram.sendMessage(id, 'Use /start again!', {reply_markup: { remove_keyboard: true }});
}

const mainMenu = {
    "reply_markup": {
        keyboard: [
            [{text: "New Match"}],
            [{text: "Match Started"}],
            [{text: "Match Finished"}],
            [{text: "Let's Bet!"}],
            [{text: "Users Rank"}],
        ]
    }
};