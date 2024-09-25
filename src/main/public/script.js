document.getElementById('shuttle-form').addEventListener('submit', function(event) {
    event.preventDefault();

    const studentId = document.getElementById('student-id').value.trim();
    const statusMessage = document.getElementById('status');

    if (!studentId) {
        statusMessage.textContent = 'Please enter a student ID.';
        statusMessage.style.color = 'red';
        return;
    }

    fetch('/api/pay', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentId: studentId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            statusMessage.textContent = data.message + ` SMS sent to ${data.phoneNumber}.`;
            statusMessage.style.color = 'green';
        } else {
            statusMessage.textContent = data.message || 'Payment failed. Please try again.';
            statusMessage.style.color = 'red';
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        statusMessage.textContent = 'An error occurred. Please try again later.';
        statusMessage.style.color = 'red';
    });

    document.getElementById('student-id').value = '';
});
