# 🚀 Deploying Vega Providers to Render

Follow this guide to deploy your Vega Providers backend and its web interface to Render.

## 📋 Prerequisites
1. A **GitHub** account.
2. A **Render** account (free tier works perfectly).
3. Your code pushed to a GitHub repository.

---

## 🛠️ Deployment Steps

### 1. Create a New Web Service on Render
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository containing the source code.

### 2. Configure Service Settings
Fill in the following details:

| Name | value |
| :--- | :--- |
| **Name** | `vega-providers` (or any name you like) |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` (or `node dev-server.js`) |
| **Branch** | `pythonLitePLayer` (Ensure this matches your current branch) |

### 3. Add Environment Variables (Optional)
Render needs to know which Node.js version to use (v20 is recommended).
*   Go to the **Environment** tab.
*   Add Key: `NODE_VERSION`, Value: `20`.

### 4. Wait for Build to Finish
Once you click **Create Web Service**, Render will:
1. Clone your repo.
2. Install dependencies.
3. Build all providers into the `dist/` folder.
4. Start the server.

---

## ⚠️ Troubleshooting: "index.js not found"
If you see an error like `Error: Cannot find module 'index.js'`, it means Render is trying to run the default file.
**Solution:**
1. Go to your **Render Dashboard** -> **Settings**.
2. Find **Start Command** and change it to `npm start`.
3. Scroll down and click **Save Changes**.
4. Click **Manual Deploy** -> **Clear Build Cache & Deploy**.

---

## 🌐 How to Use Your Deployed App

### Accessing the Web Interface
Once the deployment is "Live", you will get a URL like:
`https://vega-providers-xxxx.onrender.com`

When you visit this URL, you will see the **Vega Web Interface** immediately.

### Configuring Your API URL
If the web interface does not load providers automatically:
1. Click the **Settings** (gear icon) in the bottom-left corner of the web interface.
2. Ensure the **API URL** is set to your Render URL: `https://vega-providers-xxxx.onrender.com`.
3. Save and the page will refresh.

### Using with the Vega Mobile/Desktop App
If you are using the separate Vega application:
*   Go to your App settings.
*   Update the **Provider URL** or **Extension URL** to your Render URL.

---

## 💡 Troubleshooting
*   **Provider not found error**: Ensure `npm run build` completed successfully in the Render logs.
*   **Fetch Error**: Check if your Render URL uses `https`. The web interface requires a secure connection for some features.
*   **VLC and Local Features**: Note that features like "Launch VLC" only work if the server is running on your local machine. They will not work on Render.
