# Deploying FinTechIQ ML Service to Render

## **Quick Deployment (5-10 minutes)**

### **Step 1: Push Code to GitHub**

```bash
# In your repo root
git add .
git commit -m "Add ML service for Render deployment"
git push origin main
```

### **Step 2: Create New Render Service**

1. Go to **[render.com](https://render.com)** (login/sign up)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo
4. Select the repo with your code

### **Step 3: Configure Service**

| Setting | Value |
|---------|-------|
| **Name** | `fintechiq-ml` |
| **Root Directory** | `project/ml` |
| **Environment** | `Python 3.11` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app:app --host 0.0.0.0 --port $PORT` |
| **Plan** | Free (or Starter $7/mo for stability) |

### **Step 4: Set Environment Variables**

Click **"Environment"** and add:

```
TF_CPP_MIN_LOG_LEVEL = 3
OMP_NUM_THREADS = 1
TF_FORCE_GPU_ALLOW_GROWTH = true
CUDA_VISIBLE_DEVICES = (empty)
```

### **Step 5: Deploy**

1. Click **"Create Web Service"**
2. Wait for deployment (3-5 minutes)
3. Get the URL: `https://fintechiq-ml.onrender.com`

---

## **Step 6: Update Backend to Use New ML Service**

Once ML service is deployed, update your backend `.env`:

```bash
# project/server/.env
ML_SERVICE=https://fintechiq-ml.onrender.com
LOCAL_ML=http://127.0.0.1:8000
```

Or if using environment variables in Render backend dashboard:

```
ML_SERVICE = https://fintechiq-ml.onrender.com
```

### **Then redeploy backend** (if already on Render):
1. Go to Render dashboard
2. Click your backend service
3. Click **"Logs"**
4. Trigger redeploy (or just push code to GitHub)

---

## **Testing After Deployment**

### **Test 1: Check ML Service Health**

```bash
curl https://fintechiq-ml.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "FinTechIQ ML API",
  "ml_ready": true,
  "ml_error": null
}
```

### **Test 2: Test Prediction**

```bash
curl -X POST https://fintechiq-ml.onrender.com/predict \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "input_days": 60,
    "algorithm": "lstm"
  }'
```

### **Test 3: Via Chatbot**

In your app, try:
```
"predict AAPL"
```

Should now work! ✅

---

## **Troubleshooting**

### **Problem: "Bad Gateway" or Service Not Starting**

**Solution:**
1. Check Render logs: Dashboard → Service → Logs
2. Look for build errors
3. Verify `requirements.txt` is in `project/ml/`
4. Restart service: Dashboard → Manual Deploy

### **Problem: ML Still Says "Unavailable"**

**Check backend is using correct URL:**
```bash
# SSH into backend and check
echo $ML_SERVICE
```

If wrong, update in Render dashboard:
1. Go to backend service
2. Environment variables
3. Set `ML_SERVICE=https://fintechiq-ml.onrender.com`
4. Redeploy

### **Problem: Prediction Takes 30+ seconds**

**Expected on free tier:**
- Free Render services sleep after 15 minutes
- First request takes 30-60 seconds (cold start)
- Upgrade to Starter ($7/mo) for instant responses

### **Problem: "Out of Memory"**

**Solution:**
- Free tier has 512MB RAM (just enough for ML)
- If still failing, upgrade to Starter plan
- Or disable Prophet/XGBoost in `app.py` to reduce memory

---

## **Architecture After Deployment**

```
┌─────────────────────────────────────────────┐
│           Your Domain (optional)             │
│  https://fintechiq.yourdomain.com           │
└────────────────┬────────────────────────────┘
                 │
      ┌──────────┴──────────┐
      │                     │
      ▼                     ▼
┌─────────────┐       ┌──────────────┐
│  Frontend   │       │   Backend    │
│  (React)    │◄─────►│  (Node.js)   │
│ Render      │       │  Render      │
│ Static      │       │  Port 5000   │
└─────────────┘       └──────┬───────┘
                             │
                             ▼
                       ┌──────────────┐
                       │  ML Service  │
                       │  (Python)    │
                       │  Render      │
                       │  Port 8000   │
                       └──────────────┘
```

---

## **Next Steps**

1. ✅ Push code to GitHub
2. ✅ Create Render service for ML
3. ✅ Update backend `.env`
4. ✅ Test `/predict` endpoint
5. ✅ Try predictions in chatbot

---

## **Cost Estimate**

| Service | Tier | Cost/Month |
|---------|------|-----------|
| Frontend + Backend | Free | $0 |
| ML Service | Free | $0* |
| **Total** | **Free** | **$0** |

*Free tier sleeps after 15 min inactivity. For always-on:
- Starter: $7/month each service
- Standard: $12/month+

---

## **Questions?**

If deployment fails:
1. Check Render logs
2. Verify GitHub sync is working
3. Try manual redeploy
4. Contact Render support (very responsive!)

Good luck! 🚀
