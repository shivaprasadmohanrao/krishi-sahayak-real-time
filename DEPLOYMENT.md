#  Deployment Guide - Krishi Sahayak

## AWS App Runner

### Step 1: Push to GitHub

### Step 2: Create App Runner Service

1. Go to **AWS App Runner Console**
2. Click **Create service**
3. **Source**: GitHub
4. Connect your GitHub account
5. Select repository: `krishi-sahayak`
6. Branch: `main`
7. **Build settings**:
   - Runtime: Node.js 18
   - Build command: `npm install`
   - Start command: `node src/server.js`
   - Port: `3000`
8. **Environment variables**: Add all from `.env.example`
9. **Instance**: 1 vCPU, 2 GB RAM
10. Click **Create & deploy**

### Step 3: Get Public URL

App Runner will provide a URL like: `https://xxxxx.us-east-1.awsapprunner.com`

---

## 🔐 Secure API Key Management

### Best Practices:

1. **NEVER commit `.env` to GitHub**
   - Already added to `.gitignore`
   - Use `.env.example` as template

2. **Use AWS Systems Manager Parameter Store**
   ```bash
   # Store secrets
   aws ssm put-parameter --name "/app/SECRET_NAME" --value "SECRET_VALUE" --type "SecureString"
   
   # Retrieve in application
   const AWS = require('aws-sdk');
   const ssm = new AWS.SSM();
   const param = await ssm.getParameter({ Name: '/app/SECRET_NAME', WithDecryption: true }).promise();
   ```

3.  **Environment Variables in App Runner**
   - Add directly in App Runner console
   - Encrypted at rest

---

### AWS App Runner
- **Cost**: ~$10-15/month
- **Includes**: Auto-scaling, HTTPS, monitoring

### Data Transfer
- **First 100 GB**: FREE
- **After**: $0.09/GB
---


## 🆘 Need Help?

- AWS Documentation: https://docs.aws.amazon.com
- Docker Documentation: https://docs.docker.com
- Socket.IO on AWS: https://socket.io/docs/v4/
