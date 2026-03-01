# 🚀 Deployment Guide - Krishi Sahayak

## 📌 Recommended: EC2 + Docker Deployment

### Prerequisites
- AWS Account
- GitHub Account
- Domain name (optional, but recommended)

---

## 🎯 Option 1: EC2 with Docker (RECOMMENDED - $5-10/month)

### Step 1: Launch EC2 Instance

1. **Go to AWS EC2 Console**
   - Region: `us-east-1` (or your preferred region)

2. **Launch Instance**
   - **AMI**: Amazon Linux 2023 or Ubuntu 22.04
   - **Instance Type**: `t3.micro` (Free tier eligible) or `t3.small` ($15/month)
   - **Storage**: 20 GB gp3
   - **Security Group**: 
     - SSH (22) - Your IP only
     - HTTP (80) - 0.0.0.0/0
     - HTTPS (443) - 0.0.0.0/0
     - Custom TCP (3000) - 0.0.0.0/0

3. **Create/Download Key Pair** (save as `krishi-sahayak.pem`)

### Step 2: Connect to EC2

```bash
chmod 400 krishi-sahayak.pem
ssh -i krishi-sahayak.pem ec2-user@YOUR_EC2_PUBLIC_IP
```

### Step 3: Install Docker on EC2

```bash
# Update system
sudo yum update -y

# Install Docker
sudo yum install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
sudo yum install git -y

# Logout and login again for docker group to take effect
exit
```

### Step 4: Clone Your Repository

```bash
# SSH back in
ssh -i krishi-sahayak.pem ec2-user@YOUR_EC2_PUBLIC_IP

# Clone your repo
git clone https://github.com/YOUR_USERNAME/krishi-sahayak.git
cd krishi-sahayak
```

### Step 5: Set Up Environment Variables (SECURE METHOD)

**Option A: AWS Systems Manager Parameter Store (FREE & SECURE)**

```bash
# Install AWS CLI (if not already installed)
sudo yum install aws-cli -y

# Configure AWS CLI
aws configure

# Store secrets in Parameter Store
aws ssm put-parameter --name "/krishi-sahayak/AWS_ACCESS_KEY_ID" --value "YOUR_KEY" --type "SecureString"
aws ssm put-parameter --name "/krishi-sahayak/AWS_SECRET_ACCESS_KEY" --value "YOUR_SECRET" --type "SecureString"
aws ssm put-parameter --name "/krishi-sahayak/OPEN_WEATHER_APIKEY" --value "YOUR_KEY" --type "SecureString"
aws ssm put-parameter --name "/krishi-sahayak/ISRO_VEDAS_API" --value "YOUR_KEY" --type "SecureString"

# Create script to fetch secrets
cat > fetch-secrets.sh << 'EOF'
#!/bin/bash
export AWS_ACCESS_KEY_ID=$(aws ssm get-parameter --name "/krishi-sahayak/AWS_ACCESS_KEY_ID" --with-decryption --query "Parameter.Value" --output text)
export AWS_SECRET_ACCESS_KEY=$(aws ssm get-parameter --name "/krishi-sahayak/AWS_SECRET_ACCESS_KEY" --with-decryption --query "Parameter.Value" --output text)
export OPEN_WEATHER_APIKEY=$(aws ssm get-parameter --name "/krishi-sahayak/OPEN_WEATHER_APIKEY" --with-decryption --query "Parameter.Value" --output text)
export ISRO_VEDAS_API=$(aws ssm get-parameter --name "/krishi-sahayak/ISRO_VEDAS_API" --with-decryption --query "Parameter.Value" --output text)
export AWS_REGION=us-east-1
export PORT=3000
export NODE_ENV=production
EOF

chmod +x fetch-secrets.sh
```

**Option B: Manual .env file (LESS SECURE - Only for testing)**

```bash
# Create .env file
nano .env

# Paste your environment variables
# Press Ctrl+X, then Y, then Enter to save

# Secure the file
chmod 600 .env
```

### Step 6: Build and Run with Docker

```bash
# Build Docker image
docker build -t krishi-sahayak .

# Run container
docker run -d \
  --name krishi-sahayak \
  -p 80:3000 \
  --env-file .env \
  --restart unless-stopped \
  krishi-sahayak

# OR use docker-compose
docker-compose up -d
```

### Step 7: Verify Deployment

```bash
# Check if container is running
docker ps

# Check logs
docker logs krishi-sahayak

# Test health endpoint
curl http://localhost:3000/health
```

### Step 8: Access Your Application

Open browser: `http://YOUR_EC2_PUBLIC_IP`

---

## 🎯 Option 2: AWS App Runner (EASIEST - $10-15/month)

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/krishi-sahayak.git
git push -u origin main
```

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

3. **Use IAM Roles** (for EC2)
   - Create IAM role with SSM read permissions
   - Attach to EC2 instance
   - No need to store AWS credentials in .env

4. **Environment Variables in App Runner**
   - Add directly in App Runner console
   - Encrypted at rest

---

## 🌐 Add Custom Domain (Optional)

### Using Route 53:

1. **Register domain** in Route 53 ($12/year)
2. **Create A record** pointing to EC2 IP
3. **Install Nginx** for reverse proxy
4. **Get SSL certificate** with Let's Encrypt (FREE)

```bash
# Install Nginx
sudo yum install nginx -y

# Install Certbot
sudo yum install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Configure Nginx
sudo nano /etc/nginx/conf.d/krishi-sahayak.conf
```

Nginx config:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 📊 Cost Estimation

### EC2 t3.micro (Free Tier)
- **First 12 months**: FREE (750 hours/month)
- **After free tier**: ~$7.50/month

### EC2 t3.small
- **Cost**: ~$15/month
- **Better performance** for hackathon demo

### AWS App Runner
- **Cost**: ~$10-15/month
- **Includes**: Auto-scaling, HTTPS, monitoring

### Data Transfer
- **First 100 GB**: FREE
- **After**: $0.09/GB

**Recommended for Hackathon**: EC2 t3.micro (FREE) or t3.small ($15/month)

---

## 🐛 Troubleshooting

### Container won't start
```bash
docker logs krishi-sahayak
```

### Port already in use
```bash
sudo lsof -i :3000
sudo kill -9 PID
```

### Update application
```bash
git pull
docker-compose down
docker-compose up -d --build
```

### Check health
```bash
curl http://localhost:3000/health
```

---

## 📝 GitHub Repository Setup

### Step 1: Create Repository

1. Go to GitHub.com
2. Click **New repository**
3. Name: `krishi-sahayak`
4. Description: "AI-Powered Farming Assistant for Indian Farmers"
5. **Public** (for hackathon judges)
6. Don't initialize with README (we have one)

### Step 2: Push Code

```bash
# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Krishi Sahayak - AI Farming Assistant"

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/krishi-sahayak.git

# Push
git branch -M main
git push -u origin main
```

### Step 3: Add README

Create a good README.md with:
- Project description
- Features
- Screenshots
- Live demo URL
- Tech stack
- Setup instructions

---

## ✅ Pre-Deployment Checklist

- [ ] `.env` is in `.gitignore`
- [ ] `.env.example` is committed
- [ ] Dockerfile is tested locally
- [ ] Health endpoint works (`/health`)
- [ ] All API keys are stored securely
- [ ] Security group allows port 80/443
- [ ] Application runs on EC2
- [ ] Public URL is accessible
- [ ] WebSocket connections work
- [ ] Audio streaming works
- [ ] Weather API works in text chat mode

---

## 🎉 Final Steps for Hackathon

1. **Deploy to EC2** using steps above
2. **Get public URL**: `http://YOUR_EC2_IP` or custom domain
3. **Test thoroughly** with judges' perspective
4. **Create GitHub repo** (public)
5. **Add good README** with screenshots
6. **Submit URL** to hackathon judges
7. **Keep EC2 running** during judging period

---

## 💡 Tips for Hackathon Demo

1. **Use t3.small** for better performance during demo
2. **Add monitoring** with CloudWatch (free tier)
3. **Set up alerts** for downtime
4. **Test from different devices** (mobile, desktop)
5. **Prepare backup** (keep local version running)
6. **Document everything** in README
7. **Add demo video** to GitHub repo

---

## 🆘 Need Help?

- AWS Documentation: https://docs.aws.amazon.com
- Docker Documentation: https://docs.docker.com
- Socket.IO on AWS: https://socket.io/docs/v4/

Good luck with your hackathon! 🚀
