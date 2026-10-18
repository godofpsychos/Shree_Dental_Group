const SECURE_TOKEN = "869f282d-b735-4c97-95e6-a3d300869d3c";
const MAIL_TO = 'shreedentalclinicchimur@gmail.com';
const MAIL_FROM = "tarunpal13982@gmail.com";

const cscriptURL = 'https://script.google.com/macros/s/AKfycbxF4n6ZhGXh2M3TyojJ6QNOkvxp0VvyRifwkWhpz9mSx2VynHgfTyEmVvLLIfD_2yh_/exec';
const ascriptURL = 'https://script.google.com/macros/s/AKfycbxlqktA9WM15sPor6yeOihbc0z6BkjfikjnDt74zd56FjoGITswr3rkEQvWK4GogWQOEw/exec';

// Prevent user input from injecting HTML into the notification email
function esc(value) {
    const d = document.createElement('div');
    d.textContent = value;
    return d.innerHTML;
}

function handleForm(form, { url, subject, heading, fields, success }) {
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (button.disabled) return;
        button.disabled = true;

        const body = (heading ? heading + '<br>' : '') +
            fields.map(([label, id]) => `<b>${label}:</b> ${esc(document.getElementById(id).value)}<br>`).join('');
        const name = document.getElementById(fields[0][1]).value;

        // Email is a best-effort notification; the Google Sheet submission is the source of truth
        if (typeof Email !== 'undefined') {
            Email.send({
                SecureToken: SECURE_TOKEN,
                To: MAIL_TO,
                From: MAIL_FROM,
                Subject: subject + name,
                Body: body
            });
        }

        fetch(url, { method: 'POST', body: new FormData(form) })
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                // Apps Script sheet handlers usually reply {"result":"success"|"error"}
                const text = await res.text();
                let data = null;
                try { data = JSON.parse(text); } catch (_) { /* non-JSON reply: rely on HTTP status */ }
                if (data && data.result === 'error') throw new Error(data.error || 'Script error');
                alert(success);
                form.reset();
            })
            .catch(() => alert("Sorry, something went wrong. Please try again or call us at 9340389430."))
            .finally(() => { button.disabled = false; });
    });
}

handleForm(document.getElementById('contact-form'), {
    url: cscriptURL,
    subject: "New query/feedback from ",
    fields: [['Name', 'cname'], ['Email', 'cemail'], ['Phone', 'cphone'], ['Feedback', 'cfeedback']],
    success: "Thanks for contacting us! We will get back to you soon."
});

handleForm(document.getElementById('appointment-form'), {
    url: ascriptURL,
    subject: "New Appointment of ",
    heading: "Book an appointment:",
    fields: [['Name', 'aname'], ['Email', 'aemail'], ['Phone', 'aphone'], ['Date', 'adate']],
    success: "Thanks for choosing us. Your appointment has been booked successfully."
});

// Disallow past dates (local time, not UTC)
const adate = document.getElementById('adate');
const now = new Date();
adate.min = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
