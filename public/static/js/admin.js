async function checkForMaintenance() {
    // 1. Correct the ID to match your HTML exactly
    const mainBtn = document.getElementById('maintanence-toggle');

    async function refreshStatus() {
        try {
            // 2. Correct the URL to match your server route
            const response = await fetch('/admin/maintanence', {
                credentials: "same-origin"
            });
            const data = await response.json();

            // 3. Update the button text immediately
            mainBtn.innerText = data.maintanence ? 
                'Deactivate maintanence mode' : 
                'Activate maintanence mode';
            
            return data.maintanence;
        } catch (e) {
            console.error('Fetch error:', e);
            mainBtn.innerText = 'Error loading status';
        }
    }

    // Run once on page load
    await refreshStatus();

    // 4. Set up the click listener ONCE
    mainBtn.onclick = async () => {
        const response = await fetch('/admin/maintanence', {
            method: "POST",
            credentials: 'same-origin'
        });

        if (response.ok) {
            const data = await response.json();
            // 5. Re-run the refresh logic to update the button text
            await refreshStatus(); 
            alert(`Maintanence mode is now ${data.maintanence ? 'ON' : 'OFF'}`);
        }
    };
}

let allUsers = []; // Global variable to store the full list

async function loadUserList() {
    try {
        const response = await fetch('/api/admin/users');
        allUsers = await response.json(); // Save to our global variable
        renderUserList(allUsers); // Helper function to show them
    } catch (e) {
        console.error("Failed to load user list:", e);
    }
}

// New helper function to draw the cards
function renderUserList(usersToDisplay) {
    const container = document.getElementById('user-list-container');
    
    // Check if any users matched the search
    if (usersToDisplay.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <p>No users found matching your search.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = usersToDisplay.map(user => {
        const toggleText = user.role === 'admin' ? 'Demote' : 'Promote';
        return `
            <div class="user-card">
                <div class="user-info">
                    <strong>${user.username}</strong> 
                    <span>[${user.role}]</span>
                    <div style="font-size: 0.8em; color: gray;">ID: ${user.userID}</div>
                </div>
                <div class="user-actions">
                    <button onclick="toggleRole('${user.username}')" class="promote-btn">${toggleText}</button>
                    <button onclick="deleteUser('${user.username}')" class="delete-btn">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// The Search Logic
function filterUsers() {
    const query = document.getElementById('userSearch').value.toLowerCase();
    
    // Filter the allUsers array based on username or ID
    const filtered = allUsers.filter(user => {
    // We convert everything to lowercase so the search isn't picky
    const nameMatch = user.username.toLowerCase().includes(query.toLowerCase());
    const idMatch = user.userID.toString().includes(query);
    
    return nameMatch || idMatch;
});

    renderUserList(filtered); // Redraw only the matching users
}

async function deleteUser(id) {
    if (!confirm(`Delete ${id}?`)) return;
    
    try {
        const response = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        
        if (response.ok) {
            loadUserList(); // Success!
        } else if (response.status === 404) {
            alert("This user no longer exists. Refreshing list...");
            loadUserList(); // Sync the UI with the server
        } else {
            alert("Server error. Check logs.");
        }
    } catch (e) {
        console.error("Connection failed:", e);
    }
}

async function toggleRole(id) {
    try {
        const response = await fetch(`/api/admin/users/toggle-role/${id}`, {
            method: 'POST'
        });

        if (response.ok) {
            loadUserList(); // Refresh the UI to show the new role
        } else {
            const result = await response.json();
            alert("Error: " + result.error);
        }
    } catch (e) {
        console.error("Toggle failed:", e);
    }
}

window.onload = () => {
    checkForMaintenance();
    loadUserList();
};