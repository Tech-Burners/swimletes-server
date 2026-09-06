// In a separate file (helpers.js) or inside app.js
function getDevLoginPage() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Developer Login</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Fira+Code&display=swap');
  
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
  
          body {
            background-color: #1a1c23;
            color: #d1d9e6;
            font-family: 'Fira Code', monospace;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
  
          .login-container {
            background-color: #21252b;
            border-radius: 12px;
            padding: 30px;
            width: 100%;
            max-width: 380px;
            box-shadow: 0 0 15px rgba(0, 255, 255, 0.2);
            animation: shadowPulse 3s infinite ease-in-out;
          }
  
          @keyframes shadowPulse {
            0%, 100% {
              box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
            }
            50% {
              box-shadow: 0 0 40px rgba(0, 255, 255, 0.7);
            }
          }
  
          h2 {
            text-align: center;
            margin-bottom: 20px;
            color: #58d6d1;
            font-size: 1.6rem;
            text-transform: uppercase;
          }
  
          input {
            width: 100%;
            padding: 12px;
            margin-bottom: 20px;
            border: 1px solid #444d56;
            border-radius: 8px;
            background-color: #21252b;
            color: #d1d9e6;
            font-size: 1rem;
            outline: none;
            transition: border 0.3s ease, background-color 0.3s ease;
          }
  
          input:focus {
            border-color: #58d6d1;
            background-color: #333;
          }
  
          button {
            width: 100%;
            padding: 12px;
            background: #58d6d1;
            color: #21252b;
            border: none;
            border-radius: 8px;
            font-size: 1.1rem;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s;
          }
  
          button:hover {
            background: #46b8b0;
            transform: scale(1.05);
          }
  
          a {
            display: block;
            text-align: center;
            margin-top: 18px;
            font-size: 0.9rem;
            color: #5c636a;
            text-decoration: none;
          }
  
          a:hover {
            color: #58d6d1;
            text-decoration: underline;
          }
  
          .dev-icon {
            font-size: 1.5rem;
            color: #58d6d1;
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <div class="login-container">
          <form method="POST" action="/">
            <h2><span class="dev-icon">👨‍💻</span> Dev Login</h2>
            <input name="username" placeholder="Username" required />
            <input name="password" type="password" placeholder="Password" required />
            <button type="submit">Log In</button>
            <a href="/">← Back to Home</a>
          </form>
        </div>
      </body>
      </html>
    `;
  }
  
  module.exports = {getDevLoginPage};