# EC2 Docker Deployment - Quick Guide

## Prerequisites
- AWS Account
- Terminal with SSH

---

## PART 1: AWS SETUP (15 min)

### 1. Get AWS Credentials
- AWS Console → IAM → Users → Create User
- Attach policy: `AmazonEC2FullAccess`
- Create Access Key → Save credentials
- Add to `.env`:
  ```
  AWS_ACCESS_KEY_ID=your_key
  AWS_SECRET_ACCESS_KEY=your_secret
  AWS_REGION=us-east-1
  OPEN_WEATHER_APIKEY=your_weather_key
  ```

### 2. Launch EC2 Instance
- EC2 Dashboard → Launch Instance
- **Name**: `krishi-sahayak`
- **AMI**: Ubuntu 22.04 LTS
- **Type**: t2.small (Recommended) or t2.micro (Free tier)
- **Key pair**: Create new → Download `.pem` → Save securely
- **Security Group Rules**:
  - SSH (22) - Your IP
  - HTTP (80) - 0.0.0.0/0
  - HTTPS (443) - 0.0.0.0/0
  - Custom TCP (3000) - 0.0.0.0/0
- **Storage**: 20 GB
- Launch → Copy Public IP

### 3. Connect to EC2
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

---

## PART 2: SERVER SETUP (10 min)

### 4. Install Docker
```bash
# Update
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Logout and login
exit
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Verify
docker --version
```

---

## PART 3: DEPLOY APP (10 min)

### 5. Upload Code

**Option A: Git (Recommended)**
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

**Option B: SCP**
```bash
# From local machine
scp -i your-key.pem -r /path/to/project ubuntu@YOUR_EC2_IP:~/app
```

### 6. Create .env File
```bash
nano .env
```
Paste:
```env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
OPEN_WEATHER_APIKEY=your_weather_key
PORT=3000
NODE_ENV=production
```
Save: `Ctrl+X`, `Y`, `Enter`

### 7. Run Docker
```bash
# Build
docker build -t krishi-sahayak .

# Run
docker run -d \
  --name krishi-app \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  krishi-sahayak

# Check
docker ps
docker logs krishi-app -f
```

### 8. Test
- Browser: `http://YOUR_EC2_IP:3000`

---

## PART 4: NGINX (Optional, 15 min)

### 9. Setup Nginx
```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/krishi
```

Paste:
```nginx
server {
    listen 80;
    server_name YOUR_EC2_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/krishi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Access: `http://YOUR_EC2_IP`

### 10. SSL (If domain)
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

---

## MAINTENANCE

### Update App
```bash
git pull
docker stop krishi-app
docker rm krishi-app
docker build -t krishi-sahayak .
docker run -d --name krishi-app --restart unless-stopped -p 3000:3000 --env-file .env krishi-sahayak
```

### View Logs
```bash
docker logs krishi-app -f
```

### Restart
```bash
docker restart krishi-app
```

---

## TROUBLESHOOTING

### Container won't start
```bash
docker logs krishi-app
cat .env  # Check variables
```

### Port in use
```bash
sudo lsof -i :3000
sudo kill -9 PID
```

### Can't connect
- Check Security Group allows port 3000/80
- Check: `docker ps`
- Check: `sudo systemctl status nginx`

---

## COSTS
- **t2.micro**: Free tier / $8/month
- **t2.small**: $17/month (Recommended)
- **Storage**: $2/month

---

## SECURITY CHECKLIST
- [ ] .env not in Git
- [ ] SSH key secured (chmod 400)
- [ ] Security Group restricts SSH
- [ ] SSL installed
- [ ] Regular updates: `sudo apt update && sudo apt upgrade`
