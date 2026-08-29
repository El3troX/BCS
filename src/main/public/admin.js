let currentTxPage = 1;
let totalTxPages = 1;

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();

    document.getElementById('tab-students').addEventListener('click', () => switchTab('students'));
    document.getElementById('tab-blocked').addEventListener('click', () => switchTab('blocked'));
    document.getElementById('tab-transactions').addEventListener('click', () => switchTab('transactions'));
    document.getElementById('tab-routes').addEventListener('click', () => switchTab('routes'));

    document.getElementById('admin-logout-btn').addEventListener('click', adminLogout);
    document.getElementById('prev-tx-btn').addEventListener('click', () => { if (currentTxPage > 1) loadTransactions(currentTxPage - 1); });
    document.getElementById('next-tx-btn').addEventListener('click', () => { if (currentTxPage < totalTxPages) loadTransactions(currentTxPage + 1); });
    document.getElementById('add-route-btn').addEventListener('click', addRoute);
});

function checkAdminAuth() {
    fetch('/api/session', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (!data.authenticated || !data.isAdmin) {
                alert('Admin access required. Please log in as an administrator.');
                window.location.href = 'index.html';
                return;
            }
            loadStudents();
        })
        .catch(() => {
            window.location.href = 'index.html';
        });
}

function switchTab(tabName) {
    document.querySelectorAll('.admin-nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));

    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById(`section-${tabName}`).classList.add('active');

    if (tabName === 'students') loadStudents();
    if (tabName === 'blocked') loadBlockedCards();
    if (tabName === 'transactions') loadTransactions(1);
    if (tabName === 'routes') loadRoutes();
}

function loadStudents() {
    fetch('/api/admin/students', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const tbody = document.querySelector('#students-table tbody');
                tbody.innerHTML = '';
                data.students.forEach(s => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${s.studentId}</td>
                        <td>${s.name}</td>
                        <td>${s.email || '-'}</td>
                        <td>${s.credits}</td>
                        <td><span class="badge ${s.card_status === 'blocked' ? 'badge-blocked' : 'badge-active'}">${s.card_status}</span></td>
                        <td>${s.is_admin ? '<span class="badge badge-admin">Admin</span>' : 'Student'}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });
}

function loadBlockedCards() {
    fetch('/api/admin/blocked-cards', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const tbody = document.querySelector('#blocked-table tbody');
                tbody.innerHTML = '';
                if (data.blockedCards.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No blocked cards.</td></tr>';
                    return;
                }
                data.blockedCards.forEach(s => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${s.studentId}</td>
                        <td>${s.name}</td>
                        <td>${s.email || '-'}</td>
                        <td>${s.credits}</td>
                        <td><span class="badge badge-blocked">${s.card_status}</span></td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });
}

function loadTransactions(page = 1) {
    currentTxPage = page;
    fetch(`/api/admin/transactions?page=${page}&limit=10`, { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const tbody = document.querySelector('#transactions-table tbody');
                tbody.innerHTML = '';
                totalTxPages = Math.ceil((data.total || 1) / 10) || 1;
                document.getElementById('tx-page-info').textContent = `Page ${data.page} of ${totalTxPages} (Total: ${data.total})`;

                if (data.transactions.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No transactions found.</td></tr>';
                    return;
                }
                data.transactions.forEach(t => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${t.timestamp}</td>
                        <td>${t.studentId}</td>
                        <td>${t.type}</td>
                        <td>${t.amount} credits</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });
}

function loadRoutes() {
    fetch('/api/routes', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const tbody = document.querySelector('#routes-table tbody');
                tbody.innerHTML = '';
                data.routes.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${r.id}</td>
                        <td>${r.name}</td>
                        <td>${r.fare}</td>
                        <td>
                            <button onclick="editRouteFare(${r.id}, ${r.fare})" style="width:auto; padding:4px 8px; margin-right:5px;">Edit Fare</button>
                            <button onclick="deleteRoute(${r.id})" style="width:auto; padding:4px 8px; background-color:#dc3545;">Delete</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });
}

function addRoute() {
    const name = document.getElementById('new-route-name').value.trim();
    const fare = parseInt(document.getElementById('new-route-fare').value, 10);

    if (!name || isNaN(fare) || fare <= 0) {
        alert('Please enter a valid route name and positive fare.');
        return;
    }

    fetch('/api/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, fare })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById('new-route-name').value = '';
            document.getElementById('new-route-fare').value = '';
            loadRoutes();
        } else {
            alert(data.message || 'Failed to add route.');
        }
    });
}

window.editRouteFare = function(id, currentFare) {
    const newFare = prompt('Enter new fare for route ID ' + id + ':', currentFare);
    if (!newFare) return;
    const num = parseInt(newFare, 10);
    if (isNaN(num) || num <= 0) {
        alert('Invalid fare amount.');
        return;
    }

    fetch(`/api/admin/routes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ fare: num })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loadRoutes();
        } else {
            alert(data.message || 'Failed to update route fare.');
        }
    });
};

window.deleteRoute = function(id) {
    if (!confirm('Are you sure you want to delete route ID ' + id + '?')) return;

    fetch(`/api/admin/routes/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loadRoutes();
        } else {
            alert(data.message || 'Failed to delete route.');
        }
    });
};

function adminLogout() {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
        .then(() => {
            window.location.href = 'index.html';
        });
}
