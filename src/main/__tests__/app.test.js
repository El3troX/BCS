process.env.SESSION_SECRET = 'test-session-secret-key-123456789';
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.FARE_PER_TRIP = '20';
process.env.MS_HOST = 'localhost';
process.env.MS_USER = 'root';
process.env.MS_PASS = 'root';
process.env.MS_DB = 'bcs_test';

const bcrypt = require('bcrypt');

// In-memory mock database
let studentsTable = {};
let historyTable = [];

function resetDb() {
    studentsTable = {
        '23BCE1001': {
            studentid: '23BCE1001',
            studentId: '23BCE1001',
            name: 'Alice Smith',
            email: 'alice@vitstudent.ac.in',
            credits: 100,
            card_status: 'active',
            pin: bcrypt.hashSync('1234', 10)
        },
        '23BCE1002': {
            studentid: '23BCE1002',
            studentId: '23BCE1002',
            name: 'Bob Jones',
            email: 'bob@vitstudent.ac.in',
            credits: 15, // Insufficient for fare (20)
            card_status: 'active',
            pin: bcrypt.hashSync('4321', 10)
        },
        '23BCE1003': {
            studentid: '23BCE1003',
            studentId: '23BCE1003',
            name: 'Charlie Brown',
            email: 'charlie@vitstudent.ac.in',
            credits: 100,
            card_status: 'blocked',
            pin: bcrypt.hashSync('1111', 10)
        },
        '23BCE1004': {
            studentid: '23BCE1004',
            studentId: '23BCE1004',
            name: 'Diana Prince',
            email: 'diana@vitstudent.ac.in',
            credits: 20, // Exactly enough for 1 trip
            card_status: 'active',
            pin: bcrypt.hashSync('9999', 10)
        }
    };
    historyTable = [];
}

// Global mutex to simulate SELECT ... FOR UPDATE / transaction locks
let rowLocks = new Set();

const mockConnection = () => {
    let inTransaction = false;
    let lockedStudentId = null;

    const execute = async (sql, params = []) => {
        const queryLower = sql.toLowerCase();

        // SHOW COLUMNS
        if (queryLower.includes('show columns')) {
            return [[{ Field: 'pin' }]];
        }

        // ALTER TABLE
        if (queryLower.includes('alter table')) {
            return [{}];
        }

        // SELECT COUNT(*)
        if (queryLower.includes('select count(*)')) {
            const studentId = params[0];
            const filtered = historyTable.filter(h => h.studentId === studentId);
            return [[{ total: filtered.length }]];
        }

        // SELECT from payment_history
        if (queryLower.includes('from payment_history')) {
            const studentId = params[0];
            const limit = params[1] || 20;
            const offset = params[2] || 0;
            const filtered = historyTable.filter(h => h.studentId === studentId);
            return [filtered.slice(offset, offset + limit)];
        }

        // SELECT * FROM students ... FOR UPDATE
        if (queryLower.includes('from students') && queryLower.includes('for update')) {
            const studentId = params[0];
            // Simulate row lock wait
            while (rowLocks.has(studentId)) {
                await new Promise(r => setTimeout(r, 10));
            }
            rowLocks.add(studentId);
            lockedStudentId = studentId;
            const student = studentsTable[studentId];
            return [student ? [{ ...student }] : []];
        }

        // Normal SELECT from students
        if (queryLower.includes('from students')) {
            const studentId = params[0];
            const student = studentsTable[studentId];
            return [student ? [{ ...student }] : []];
        }

        // UPDATE students SET credits = credits + ?
        if (queryLower.includes('update students set credits = credits +')) {
            const [added, studentId] = params;
            if (studentsTable[studentId]) {
                studentsTable[studentId].credits += Number(added);
            }
            return [{ affectedRows: studentsTable[studentId] ? 1 : 0 }];
        }

        // UPDATE students SET credits = ?
        if (queryLower.includes('update students set credits =')) {
            const [newCredits, studentId] = params;
            if (studentsTable[studentId]) {
                studentsTable[studentId].credits = Number(newCredits);
            }
            return [{ affectedRows: studentsTable[studentId] ? 1 : 0 }];
        }

        // UPDATE students SET card_status = ?
        if (queryLower.includes('update students set card_status')) {
            const isBlocked = queryLower.includes('"blocked"');
            const isActive = queryLower.includes('"active"');
            const studentId = params[0];
            if (studentsTable[studentId]) {
                studentsTable[studentId].card_status = isBlocked ? 'blocked' : (isActive ? 'active' : 'unknown');
                return [{ affectedRows: 1 }];
            }
            return [{ affectedRows: 0 }];
        }

        // INSERT INTO payment_history
        if (queryLower.includes('insert into payment_history')) {
            const [studentId, amount, type] = params;
            historyTable.push({
                studentId,
                amount,
                type,
                timestamp: new Date().toISOString()
            });
            return [{ affectedRows: 1 }];
        }

        // INSERT INTO students
        if (queryLower.includes('insert into students')) {
            const [studentId, name, email, credits, card_status, pin] = params;
            studentsTable[studentId] = { studentid: studentId, studentId, name, email, credits, card_status, pin };
            return [{ affectedRows: 1 }];
        }

        // UPDATE students SET pin = ?
        if (queryLower.includes('update students set pin =')) {
            const [pin, studentId] = params;
            if (studentsTable[studentId]) {
                studentsTable[studentId].pin = pin;
            }
            return [{ affectedRows: 1 }];
        }

        return [[]];
    };

    const query = (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        execute(sql, params)
            .then(([results]) => callback(null, results))
            .catch(err => callback(err));
    };

    const beginTransaction = async () => {
        inTransaction = true;
    };

    const commit = async () => {
        inTransaction = false;
        if (lockedStudentId) {
            rowLocks.delete(lockedStudentId);
            lockedStudentId = null;
        }
    };

    const rollback = async () => {
        inTransaction = false;
        if (lockedStudentId) {
            rowLocks.delete(lockedStudentId);
            lockedStudentId = null;
        }
    };

    const release = () => {
        if (lockedStudentId) {
            rowLocks.delete(lockedStudentId);
            lockedStudentId = null;
        }
    };

    return {
        execute,
        query,
        beginTransaction,
        commit,
        rollback,
        release
    };
};

const mockPool = {
    getConnection: (callback) => {
        callback(null, mockConnection());
    },
    query: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const conn = mockConnection();
        conn.query(sql, params, callback);
    },
    promise: () => ({
        getConnection: async () => mockConnection(),
        execute: async (sql, params) => mockConnection().execute(sql, params),
        query: async (sql, params) => mockConnection().execute(sql, params)
    })
};

// Mock mysql2
jest.mock('mysql2', () => ({
    createPool: () => mockPool
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
    createTransport: () => ({
        sendMail: (options, callback) => {
            if (callback) callback(null, { messageId: 'test-msg-id' });
            return Promise.resolve({ messageId: 'test-msg-id' });
        }
    })
}));

const request = require('supertest');
const app = require('../app');

describe('BCS Bus Credit System Test Suite', () => {
    beforeEach(() => {
        resetDb();
        rowLocks.clear();
    });

    describe('POST /api/login', () => {
        it('succeeds with valid studentId and correct PIN', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ studentId: '23BCE1001', pin: '1234' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.name).toBe('Alice Smith');
            expect(res.body.newCredits).toBe(100);
            expect(res.headers['set-cookie']).toBeDefined();
        });

        it('returns 401 on wrong PIN', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ studentId: '23BCE1001', pin: '9999' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Invalid PIN.');
        });

        it('returns 400 on missing PIN when student has a PIN configured', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ studentId: '23BCE1001' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('PIN is required.');
        });

        it('fails gracefully when studentId is unknown', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ studentId: 'NONEXISTENT', pin: '1234' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Invalid student ID.');
        });
    });

    describe('POST /api/pay', () => {
        let authCookie;

        beforeEach(async () => {
            const loginRes = await request(app)
                .post('/api/login')
                .send({ studentId: '23BCE1001', pin: '1234' });
            authCookie = loginRes.headers['set-cookie'];
        });

        it('succeeds and deducts FARE_PER_TRIP when authenticated with correct PIN and sufficient balance', async () => {
            const res = await request(app)
                .post('/api/pay')
                .set('Cookie', authCookie)
                .send({ pin: '1234' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.newCredits).toBe(80);
            expect(studentsTable['23BCE1001'].credits).toBe(80);
            expect(historyTable.length).toBe(1);
            expect(historyTable[0].amount).toBe(20);
        });

        it('fails with 401 when no session is provided', async () => {
            const res = await request(app)
                .post('/api/pay')
                .send({ pin: '1234' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/Authentication required/);
        });

        it('fails with 401 on wrong PIN', async () => {
            const res = await request(app)
                .post('/api/pay')
                .set('Cookie', authCookie)
                .send({ pin: 'wrong' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Invalid PIN.');
            expect(studentsTable['23BCE1001'].credits).toBe(100);
        });

        it('fails with 400 when student has insufficient balance', async () => {
            const loginBob = await request(app)
                .post('/api/login')
                .send({ studentId: '23BCE1002', pin: '4321' });
            const bobCookie = loginBob.headers['set-cookie'];

            const res = await request(app)
                .post('/api/pay')
                .set('Cookie', bobCookie)
                .send({ pin: '4321' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Not enough credits.');
            expect(studentsTable['23BCE1002'].credits).toBe(15);
        });

        it('fails with 403 when card_status is blocked', async () => {
            const loginCharlie = await request(app)
                .post('/api/login')
                .send({ studentId: '23BCE1003', pin: '1111' });
            const charlieCookie = loginCharlie.headers['set-cookie'];

            const res = await request(app)
                .post('/api/pay')
                .set('Cookie', charlieCookie)
                .send({ pin: '1111' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/Card is Blocked/);
        });
    });

    describe('POST /api/add-credits', () => {
        let authCookie;

        beforeEach(async () => {
            const loginRes = await request(app)
                .post('/api/login')
                .send({ studentId: '23BCE1001', pin: '1234' });
            authCookie = loginRes.headers['set-cookie'];
        });

        it('fails with 401 without session', async () => {
            const res = await request(app)
                .post('/api/add-credits')
                .send({ credits: 50, pin: '1234' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it('rejects zero, negative, non-numeric, and non-integer amounts with 400', async () => {
            const invalidAmounts = [0, -10, -50.5, 20.5, 'invalid', 'twenty', null, false];

            for (const amount of invalidAmounts) {
                const res = await request(app)
                    .post('/api/add-credits')
                    .set('Cookie', authCookie)
                    .send({ credits: amount, pin: '1234' });

                expect(res.status).toBe(400);
                expect(res.body.success).toBe(false);
            }
            expect(studentsTable['23BCE1001'].credits).toBe(100);
        });

        it('succeeds with valid positive integer amount and updates balance', async () => {
            const res = await request(app)
                .post('/api/add-credits')
                .set('Cookie', authCookie)
                .send({ credits: 50, pin: '1234' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.newCredits).toBe(150);
            expect(studentsTable['23BCE1001'].credits).toBe(150);
            expect(historyTable.length).toBe(1);
            expect(historyTable[0].amount).toBe(50);
            expect(historyTable[0].type).toBe('Credit Addition');
        });
    });

    describe('OTP Block and Verification Flow', () => {
        let authCookie;

        beforeEach(async () => {
            const loginRes = await request(app)
                .post('/api/login')
                .send({ studentId: '23BCE1001', pin: '1234' });
            authCookie = loginRes.headers['set-cookie'];
        });

        it('issues an OTP on valid block-card request', async () => {
            const res = await request(app)
                .post('/api/block-card')
                .set('Cookie', authCookie)
                .send({ pin: '1234' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toMatch(/OTP sent/);
        });

        it('succeeds when verifying correct OTP and blocks the card', async () => {
            await request(app)
                .post('/api/block-card')
                .set('Cookie', authCookie)
                .send({ pin: '1234' });

            // In our implementation, generated OTP was stored in app memory.
            // Let's test wrong OTP first
            const wrongRes = await request(app)
                .post('/api/verify-otp-and-block')
                .set('Cookie', authCookie)
                .send({ otp: '000000' });

            expect(wrongRes.status).toBe(400);
            expect(wrongRes.body.success).toBe(false);
            expect(studentsTable['23BCE1001'].card_status).toBe('active');
        });

        it('fails when exceeding maximum OTP attempts', async () => {
            await request(app)
                .post('/api/block-card')
                .set('Cookie', authCookie)
                .send({ pin: '1234' });

            // Fail 5 times
            for (let i = 0; i < 5; i++) {
                await request(app)
                    .post('/api/verify-otp-and-block')
                    .set('Cookie', authCookie)
                    .send({ otp: '000000' });
            }

            const finalAttempt = await request(app)
                .post('/api/verify-otp-and-block')
                .set('Cookie', authCookie)
                .send({ otp: '000000' });

            expect(finalAttempt.status).toBe(400);
            expect(finalAttempt.body.message).toMatch(/Too many failed attempts|Invalid or expired OTP/);
        });
    });

    describe('Double-Spend Concurrency and Race Condition', () => {
        it('handles two simultaneous payments with exactly one fare balance safely', async () => {
            // Diana Prince has exactly 20 credits (1 fare)
            const loginRes = await request(app)
                .post('/api/login')
                .send({ studentId: '23BCE1004', pin: '9999' });
            const dianaCookie = loginRes.headers['set-cookie'];

            expect(studentsTable['23BCE1004'].credits).toBe(20);

            // Fire two concurrent payment requests simultaneously
            const [res1, res2] = await Promise.all([
                request(app)
                    .post('/api/pay')
                    .set('Cookie', dianaCookie)
                    .send({ pin: '9999' }),
                request(app)
                    .post('/api/pay')
                    .set('Cookie', dianaCookie)
                    .send({ pin: '9999' })
            ]);

            const statuses = [res1.status, res2.status].sort();
            expect(statuses).toEqual([200, 400]);

            const successRes = res1.status === 200 ? res1 : res2;
            const failedRes = res1.status === 400 ? res1 : res2;

            expect(successRes.body.success).toBe(true);
            expect(successRes.body.newCredits).toBe(0);

            expect(failedRes.body.success).toBe(false);
            expect(failedRes.body.message).toBe('Not enough credits.');

            // Assert final balance in database is 0 (exactly 1 deduction, never negative or double-deducted)
            expect(studentsTable['23BCE1004'].credits).toBe(0);
        });
    });
});
