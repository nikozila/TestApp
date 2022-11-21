const { Client } = require('pg')

let client = null;

const GAME_STATUS = {
    NOT_STARTED: 0,
    STARTED: 1,
    FINISHED: 2,
}

async function connect() {
    client = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: 'footballbetappdb',
        password: process.env.DB_PASS,
        port: 5432,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
}


async function calculateUserScores(matchId, team1Goals, team2Goals, winner, isGroup) {
    const query = `SELECT * FROM user_match LEFT JOIN users
            ON users.id = user_match.user_id
            WHERE user_match.match_id = ${matchId}`;
    const result = await client.query(query);

    const promises = [];
    
    for (let i = 0; i < result.rows.length; i++) {
        let userMatch = result.rows[i];
        let predictionTeam1Goals = userMatch.team1_goals;
        let predictionTeam2Goals = userMatch.team2_goals;
        let predictionWinner = userMatch.winner;

        let userScore = 0;
        if (predictionTeam1Goals == team1Goals && predictionTeam2Goals == team2Goals) {
            userScore = 15;
            
        } else if ((predictionTeam1Goals - predictionTeam2Goals) == (team1Goals - team2Goals)) {
            userScore = 10;
        } else if (isGroup && predictionWinner == winner) {
            userScore = 5;
        } else if (!isGroup) {
            if ((predictionTeam1Goals > predictionTeam2Goals && team1Goals > team2Goals) || 
                (predictionTeam1Goals < predictionTeam2Goals && team1Goals < team2Goals)) {
                 userScore = 5;
            }
        }

        if (!isGroup && predictionWinner == winner) {
            userScore += 10;
        }

        promises.push(client.query(`UPDATE users SET score = score+${userScore} WHERE id = ${userMatch.user_id}`));
    }

    await Promise.all(promises);
}

module.exports = {
    newUser: async (username) => {
        await connect();
        const users = await client.query(`
            select * from users where username = '${username}'
        `);

        if (users.rows.length === 0) {
            const query = 'INSERT INTO users(username, score) VALUES($1, $2)';
            const values = [username, 0];
            await client.query(query, values);
        }
        // await end();
        
    },
    
    newMatch: async (team1, team2, isGroup) => {
        const query = `INSERT INTO matches(team1, team2, is_group, status) VALUES($1, $2, $3, $4)`;
        const values = [team1, team2, isGroup, GAME_STATUS.NOT_STARTED];
        await client.query(query, values);
    },

    getNotStartedMatches: async () => {
        const query = `select * from matches where status = ${GAME_STATUS.NOT_STARTED}`;
        const result = await client.query(query);
        return result.rows;
    },

    getStartedMatches: async () => {
        const query = `select * from matches where status = ${GAME_STATUS.STARTED}`;
        const result = await client.query(query);
        return result.rows;
    },

    setGameAsStarted: async(matchId) => {
        const query = `UPDATE matches SET status = ${GAME_STATUS.STARTED} WHERE id = ${matchId}`;
        await client.query(query);
    },

    getMatchById: async(matchId) => {
        const query = `SELECT * FROM matches WHERE id = ${matchId}`;
        const result = await client.query(query);
        return result.rows[0];
    },

    setGameAsFinished: async(matchId, team1Goals, team2Goals, winner, isGroup) => {
        const query = `UPDATE matches SET status = ${GAME_STATUS.FINISHED},
                        team1_result = ${team1Goals},
                        team2_result = ${team2Goals},
                        winner = '${winner}'
                        WHERE id = ${matchId}`;
        await client.query(query);

        await calculateUserScores(matchId, team1Goals, team2Goals, winner, isGroup);
    },

    bet: async(matchId, team1Goals, team2Goals, winner, username) => {
        let query = `SELECT * FROM users WHERE username = '${username}'`;
        let result = await client.query(query);
        const user = result.rows[0];

        query = `SELECT * FROM user_match WHERE user_id = ${user.id} AND match_id = ${matchId}`;
        result = await client.query(query);
        const won = winner || 'team10';
        if (result.rows.length) {
            //ALREADY BET
            query = `UPDATE user_match SET 
                    team1_goals = ${team1Goals},
                    team2_goals = ${team2Goals},
                    winner = '${won}'
                    WHERE user_id = ${user.id} AND match_id = ${matchId}`;
            await client.query(query);

        } else {
            //NOT BET
            query = `INSERT INTO user_match(team1_goals, team2_goals, user_id, winner, match_id) VALUES($1, $2, $3, $4, $5)`;
            const values = [team1Goals, team2Goals, user.id, winner, matchId];
            await client.query(query, values);
        }
    },

    getUsersRank: async() => {
        let query = `SELECT * FROM users`;
        let result = await client.query(query);
        const users = result.rows;
        return users;
    },

    getUsersPrediction: async(matchId) => {
        const fields = [
            'um.team1_goals',
            'um.team2_goals',
            'u.username',
            'um.winner AS prediction_winner',
            'm.team1',
            'm.team2',
            'm.is_group',
        ]
        const query = `select ${fields.join(', ')} from user_match um 
                        left join users u on u.id = um.user_id 
                        left join matches m on m.id = um.match_id 
                        where m.id = ${matchId}`;
        const result = await client.query(query);

        const msg = [];

        for (let i = 0; i < result.rows.length; i++) {
            let item = result.rows[i];
            let str = `${item.username}: ${item.team1} ${item.team1_goals} - ${item.team2_goals} ${item.team2}`;
            if (!item.is_group && item.team1_goals == item.team2_goals) {
                str += ` ,${item.prediction_winner} wins.`;
            }
            msg.push(str);
        }

        return msg;
    },

    


}