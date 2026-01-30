const express = require('express');
const chalk = require('chalk');
const session = require('express-session');
const bcrypt = require('bcrypt');
const FileStore = require('session-file-store')(session);
const path = require('node:path');
const fs = require('node:fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADDR = '0.0.0.0';

const usersFile = path.join(__dirname, 'users.json');
let users = {};
function loadUsers() {
    // Attempt to load users file; if it doesn't exist, create an empty one
    try {
        users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    } catch {
        console.log('Users file NOT FOUND. Creating empty one.');
        fs.writeFileSync(usersFile, '{}');
    }
}

const stateFile = path.join(__dirname, 'state.json');
let state = {};
function loadState() {
    // Attempt to load state file; if it doesn't exist or is invalid, (re)create it
    try {
        state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    } catch {
        console.log('State file NOT FOUND OR INVALID. Creating empty one.');
        fs.writeFileSync(stateFile, '{}');
    }
}

app.use(session({
    store: new FileStore({
        path: path.join(__dirname, 'sessions') || './sessions',
        retries: 0
    }),
    secret: process.env.SECRET || 'awourgnejahglwkrhgioarhgotbgahehzynubieuyerbug',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1365 * 24 * 60 * 60 * 1000,
        secure: false
    }
}));

loadUsers();

app.use((req, res, next) => {
    if (req.originalUrl.includes('/static/')) {
        return next();
    }

    const ip = req.ip.replace(/^::ffff:/, '');
    const user = req.session.userID || ip;
    const timestamp = new Date().toLocaleDateString();

    let logColor = chalk.green;
    if (req.originalUrl.includes('/admin')) logColor = chalk.yellow;
    if (state.maintanence) logColor = chalk.magenta;

    console.log(
        logColor(`[${timestamp}] ${user} -> ${req.method} ${req.originalUrl}`)
    );
    next();
});

app.use(express.urlencoded({ extended: true }));

const checkIfLoggedIn = (req, res, next) => {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect('/login');
    }
};

const checkForAdmin = (req, res, next) => {
    if (req.session.loggedIn && req.session.role === 'admin') {
        next();
    } else {
        res.redirect(401, '/');
    }
};

app.use((req, res, next) => {
    // 1. Define routes that are ALWAYS accessible
    const allowedRoutes = ['/login', '/admin'];
    
    // 2. Check if the current request is for an allowed route
    const isAllowed = allowedRoutes.includes(req.path) || req.path.includes('/static/');

    // 3. Logic: Block if Maintenance is ON, User is NOT Admin, and route is NOT whitelisted
    if (state.maintenance && req.session.role !== 'admin' && !isAllowed) {
        return res.status(503).sendFile(path.join(__dirname, 'public', 'maintanence.html'));
    }
    
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

const loginHTML = `
    <!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Log in</title>
            <link rel="stylesheet" href="/static/css/style.css" type="text/css">
            <script src="/static/js/navigation.js"></script>
        </head>
        <body>
            <h1>Log in</h1>
            <form method="POST" action="/login">
                <p style="color: red;">Invalid username or password</p>
                
                <label for="username">Username</label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    placeholder="Enter your username"
                    required
                    autocomplete="username"
                >

                <label for="password">Password</label>
                <input
                    type="password"
                    id="password"
                    name="password" 
                    placeholder="Enter your password"
                    required
                    autocomplete="current-password"
                >
                
                <button type="submit">Log In</button>
            </form>
        </body>
    </html>`;

const signupError1 = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Sign Up</title>
    <link rel="stylesheet" href="/static/css/style.css" type="text/css">
    <script src="/static/js/navigation.js"></script>
</head>
<body>
    <h1>Sign Up</h1>
    <form action="/signup" method="POST">
    <p style="color: red;">User already exists</p>
        <label for="username">Username:</label>
        <input type="text" id="username" name="username" required>
        
        <label for="password">Password:</label>
        <input type="password" id="password" name="password" required>
        
        <button type="submit">Sign Up</button>
    </form>
    
    <p>Already have an account? <a href="/login">Login</a></p>
</body>
</html>`;

const signupError2 = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Sign Up</title>
    <link rel="stylesheet" href="/static/css/style.css" type="text/css">
    <script src="/static/js/navigation.js"></script>
</head>
<body>
    <h1>Sign Up</h1>
    <form action="/signup" method="POST">
    <p style="color: red;">Both fields are required!</p>
        <label for="username">Username:</label>
        <input type="text" id="username" name="username" required>
        
        <label for="password">Password:</label>
        <input type="password" id="password" name="password" required>
        
        <button type="submit">Sign Up</button>
    </form>
    
    <p>Already have an account? <a href="/login">Login</a></p>
</body>
</html>`

app.get('/', (req, res) => {
    res.status(200).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    const error = req.query.error;
    if (!error || error === '0') {
        res.status(200).sendFile(path.join(__dirname, 'public', 'login.html'));
    } else if (error === '1') {
        res.status(200).send(loginHTML);
    } else {
        res.status(400).send('Error 400: Malfromed response. please don\'t set the error value to anything other than 0 or 1, or just don\'t include an error flag');
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];

    if (!user) {
        return res.status(401).redirect('/login?error=1')
    }

    bcrypt.compare(password, user.passwordHash, (err, match) => {
        if (err || !match) {
            return res.status(401).redirect('/login?error=1');
        }

        req.session.userID = username;
        req.session.role = user.role;
        req.session.loggedIn = true;
        res.redirect('/');
    });
});

app.post('/signup', (req, res) => {
    const { username, password } = req.body;

    // 1. Check if user already exists
    if (users[username]) {
        return res.status(301).redirect('/');
    }

    // 2. Validate input
    if (!username || !password) {
        return res.status(400).send(signupError2);
    }

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            return res.status(500).sendFile(path.join(__dirname, 'public', 'errors', '50x.html'));
        }

        // --- INCREMENTAL ID LOGIC START ---
        // Get all existing IDs, convert them to numbers, and find the highest one
        const idList = Object.values(users).map(u => parseInt(u.userID) || 0);
        const maxID = idList.length > 0 ? Math.max(...idList) : 0;
        const nextID = maxID + 1;
        // --- INCREMENTAL ID LOGIC END ---

        // 3. Save the user with the new incremented ID
        users[username] = {
            username: username,      // Store name inside for the Admin .map()
            userID: nextID,          // The new auto-incremented number
            passwordHash: hash,
            role: "user"
        };

        // 4. Update the JSON file
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

        // 5. Establish the session
        req.session.userID = username; 
        req.session.loggedIn = true;
        req.session.role = users[username].role;
        
        res.redirect('/');
    });
});

app.get('/signup', (req, res) => {
    const error = req.query.error;

    if (!error || error === '0') {
        res.status(200).sendFile(path.join(__dirname, 'public', 'signup.html'));
    } else if (error === '1') {
        res.status(200).send(signupError1);
    } else if (error === '2') {
        res.status(200).send(signupError2);
    } else {
        res.status(400).send('Error 400: Bad Request. Please do not set error to anything other than undefined (nonexistent), 0, 1, or 2.');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/admin', checkForAdmin, (req, res) => {
    res.status(200).sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/admin/maintanence', checkForAdmin, (req, res) => {
    state.maintanence = !state.maintanence;

    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

    res.json({ maintanence: state.maintanence });
});

app.get('/admin/maintanence', checkForAdmin, (req, res) => {
    res.json({ maintanence: state.maintanence });
});

app.get('/api/admin/users', checkForAdmin, (req, res) => {
    try {
        const rawData = fs.readFileSync(usersFile, 'utf8');
        const usersData = JSON.parse(rawData);

        // This is the magic line: it turns { "lucas": {...} } into [ {...} ]
        const usersArray = Object.values(usersData);

        const safeUsers = usersArray.map(u => ({
            username: u.username,
            role: u.role,
            userID: u.userID
        }));

        res.json(safeUsers);
    } catch (err) {
        console.error("Admin API Error:", err);
        res.status(500).json({ error: "Failed to load users" });
    }
});

app.delete('/api/admin/users/:id', checkForAdmin, (req, res) => {
    try {
        const targetId = req.params.id; // This is what the button sent
        console.log(`Attempting to delete: "${targetId}"`);

        const rawData = fs.readFileSync(usersFile, 'utf8');
        let usersData = JSON.parse(rawData);

        // LOGIC: Check if the ID exists as a KEY in the object
        if (usersData[targetId]) {
            delete usersData[targetId]; // Remove the entry
            fs.writeFileSync(usersFile, JSON.stringify(usersData, null, 2));
            
            console.log(`Successfully deleted: ${targetId}`);
            return res.json({ success: true });
        } else {
            // This is why it says "Could not delete" without a crash
            console.log(`Failed: User "${targetId}" not found in keys:`, Object.keys(usersData));
            return res.status(404).json({ error: "User not found" });
        }
    } catch (err) {
        console.error("Delete Route Error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/admin/users/toggle-role/:id', checkForAdmin, (req, res) => {
    try {
        const targetId = req.params.id;
        const rawData = fs.readFileSync(usersFile, 'utf8');
        let usersData = JSON.parse(rawData);

        if (usersData[targetId]) {
            // Toggle logic: if they are admin, make them user. Otherwise, make them admin.
            const oldRole = usersData[targetId].role;
            const newRole = oldRole === 'admin' ? 'user' : 'admin';
            
            usersData[targetId].role = newRole;

            fs.writeFileSync(usersFile, JSON.stringify(usersData, null, 2));
            console.log(`Changed role for ${targetId} from ${oldRole} to ${newRole}`);
            
            return res.json({ success: true, newRole: newRole });
        } else {
            return res.status(404).json({ error: "User not found" });
        }
    } catch (err) {
        console.error("Toggle Role Error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, ADDR, () => {
    console.log(chalk.blue(`Server started on port ${PORT}`));
});
