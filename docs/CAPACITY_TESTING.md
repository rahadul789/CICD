# Capacity And Stress Testing Guide

এই guide তোমার VPS stress test result বুঝতে সাহায্য করবে।

তোমার VPS:

```txt
Plan: KVM 1
CPU: 1 core
Memory: 4 GB
Disk: 50 GB
```

এই configuration দিয়ে exact কত request বা socket দিলে app crash করবে, সেটা screenshot দেখে 100% বলা যায় না। কারণ real limit শুধু CPU/RAM না; Node.js event loop, MongoDB Atlas write latency, network, Docker logs, and Nginx proxy সব মিলিয়ে bottleneck তৈরি করে।

## Your Test Result

তোমার stress script output:

```txt
reason=breaking point reached at phase 4
durationSeconds=159.1
url=http://72.60.219.174
httpStarted=15000
httpOk=13164
httpFailed=1836
socketConnected=125
connectedSocketsNow=0
socketSent=10208
socketAckOk=10182
socketAckFailed=26
socketConnectionErrors=0

lastHealthyPhase={
  "phase":3,
  "httpRps":150,
  "socketClients":100,
  "connectedSockets":100,
  "httpStarted":4500,
  "httpOk":4500,
  "httpFailed":0,
  "errorRate":0,
  "p50":494,
  "p95":1130,
  "p99":1335,
  "socketSent":6504,
  "socketAckFailed":0
}

suggestedProductionTarget=httpRps<=75, socketClients<=50

breakingPhase={
  "phase":4,
  "httpRps":200,
  "socketClients":125,
  "connectedSockets":125,
  "httpStarted":6000,
  "httpOk":4164,
  "httpFailed":1836,
  "errorRate":30.6,
  "p50":1555,
  "p95":5005,
  "p99":5011,
  "socketSent":10182,
  "socketAckFailed":0
}
```

## Short Answer

তোমার current app + VPS + MongoDB setup এই level পর্যন্ত stable ছিল:

```txt
150 HTTP requests/second
100 connected Socket.IO clients
0% HTTP error
p95 latency 1130ms
```

Breaking point শুরু হয়েছে এখানে:

```txt
200 HTTP requests/second
125 connected Socket.IO clients
30.6% HTTP error
p95 latency 5005ms
```

So, practical production target:

```txt
75 HTTP requests/second
50 connected Socket.IO clients
```

এই target conservative. Production-e breaking point-er 50% বা তার কম use করা ভালো, কারণ real users unpredictable.

## Key Terms

### RPS

RPS মানে requests per second.

```txt
150 RPS = প্রতি second এ 150 HTTP request
```

তোমার test-এ HTTP request শুধু `/health/live` না। এতে `/api/messages`, `/metrics`, and message create request-ও ছিল। তাই traffic mixed and realistic.

### Socket Client

Socket client মানে একেকটা realtime connected user.

```txt
100 socket clients = 100 realtime users connected
```

তোমার test-এ শুধু connected থাকা না, তারা message-ও পাঠাচ্ছিল। তাই load বেশি realistic.

### p50, p95, p99

Latency মানে request response আসতে কত সময় লাগছে।

```txt
p50 = 50% request এর latency এই value এর নিচে
p95 = 95% request এর latency এই value এর নিচে
p99 = 99% request এর latency এই value এর নিচে
```

Example:

```txt
p95 = 1130ms
```

মানে 95% request 1.13 second এর মধ্যে response পেয়েছে।

```txt
p95 = 5005ms
```

মানে 95% request প্রায় 5 second পর্যন্ত wait করেছে। এটা overload sign.

### Error Rate

Error rate মানে total request এর মধ্যে কত percent fail করেছে।

```txt
errorRate = failed requests / total requests * 100
```

তোমার breaking phase:

```txt
1836 failed / 6000 total = 30.6%
```

এটা অনেক বেশি. Production-e 1% error-o serious হতে পারে.

### Timeout

Stress script HTTP timeout ছিল 5000ms.

Breaking phase:

```txt
p95 = 5005ms
```

এটা দেখাচ্ছে অনেক request 5 second timeout ছুঁয়েছে। তাই fail count বেড়েছে।

## Why Phase 3 Was Healthy

Phase 3:

```txt
150 RPS
100 socket clients
4500 HTTP requests
4500 OK
0 failed
p95 1130ms
```

এখানে app still stable ছিল কারণ:

- event loop overloaded হয়নি
- MongoDB writes still manageable ছিল
- socket messages ack পাচ্ছিল
- HTTP requests timeout hit করেনি
- error rate 0%

এটা তোমার last healthy phase.

## Why Phase 4 Broke

Phase 4:

```txt
200 RPS
125 socket clients
6000 HTTP requests
4164 OK
1836 failed
30.6% error
p95 5005ms
```

এখানে traffic 150 RPS থেকে 200 RPS হয়েছে, socket clients 100 থেকে 125 হয়েছে। এই ছোট jump-ই enough ছিল overload তৈরি করতে।

Possible bottlenecks:

- 1 CPU core Node.js event loop busy হয়ে গেছে
- MongoDB Atlas write latency বেড়েছে
- app অনেক socket message save করতে গিয়ে DB queue তৈরি করেছে
- HTTP request queue জমেছে
- Docker log writes and Promtail log collection extra work করেছে
- Nginx connection handling still okay, but upstream app slow হয়েছে

## Did The App Actually Crash?

Output:

```txt
connectedSocketsNow=0
```

এটা দেখে মনে হতে পারে socket server crash করেছে, but এই summary shutdown-এর পরে print হয়েছে। Stress script শেষে নিজেই sockets disconnect করে।

More important line:

```txt
breakingPhase.connectedSockets=125
socketConnectionErrors=0
socketAckFailed=0
```

মানে phase 4 চলার সময় sockets connected ছিল। Main problem ছিল HTTP request timeout/error.

So, app hard crash না-ও করতে পারে; কিন্তু user experience broken হয়ে গেছে। Production language-e এটাকেই failure ধরা হয়।

## Why 1 CPU Core Matters

Node.js single process normally one main event loop ব্যবহার করে। 1 CPU core হলে:

- request parsing
- response generation
- Socket.IO events
- JSON serialization
- logging
- metrics collection
- MongoDB callbacks

সব একই limited CPU resource share করে।

CPU 100% না দেখালেও app slow হতে পারে, কারণ bottleneck DB/network wait, event loop delay, or pending connections হতে পারে।

## Why MongoDB Writes Matter

তোমার app message create করলে MongoDB Atlas-এ write করে।

Socket message flow:

```txt
Socket client -> message:send -> Node.js -> MongoDB save -> broadcast -> ack
```

HTTP message create flow:

```txt
POST /api/messages -> Node.js -> MongoDB save -> response
```

Stress test-এ socket and HTTP দুই জায়গা থেকেই writes হচ্ছে। Write-heavy workload read-only workload থেকে অনেক বেশি expensive.

## Safe Capacity Rule

Breaking point কখনো production target না।

Recommended:

```txt
production target = last healthy phase এর 40% to 60%
```

তোমার result:

```txt
last healthy = 150 RPS + 100 socket clients
safe target = 75 RPS + 50 socket clients
```

এই target রাখলে sudden spike, MongoDB latency, background jobs, and network jitter handle করার জায়গা থাকবে।

## What To Watch In Grafana

During stress test, watch these:

```promql
sum(rate(app_http_requests_total[1m]))
```

Shows real request rate.

```promql
sum(rate(app_http_errors_total[1m]))
```

Shows error rate trend.

```promql
histogram_quantile(0.95, sum(rate(app_http_request_duration_seconds_bucket[5m])) by (le))
```

Shows p95 latency.

```promql
app_socket_io_active_connections
```

Shows active socket clients.

```promql
sum by (source) (app_messages_sent_total)
```

Shows messages created by API and Socket.IO.

## How To Run The Capacity Test Again

PowerShell:

```powershell
$env:STRESS_TRAFFIC_URL="http://72.60.219.174"
$env:STRESS_TRAFFIC_PHASE_SECONDS="30"
$env:STRESS_TRAFFIC_HTTP_START_RPS="50"
$env:STRESS_TRAFFIC_HTTP_STEP_RPS="50"
$env:STRESS_TRAFFIC_HTTP_MAX_RPS="3000"
$env:STRESS_TRAFFIC_SOCKET_START_CLIENTS="50"
$env:STRESS_TRAFFIC_SOCKET_STEP_CLIENTS="25"
$env:STRESS_TRAFFIC_SOCKET_MAX_CLIENTS="1000"
$env:STRESS_TRAFFIC_SOCKET_MESSAGE_INTERVAL_MS="1000"
npm run traffic:stress
```

Output থেকে এই তিনটা line দেখবে:

```txt
lastHealthyPhase=...
breakingPhase=...
suggestedProductionTarget=...
```

## How To Know If App Is In Trouble

Trouble signs:

- p95 latency 2000ms এর উপরে চলে যাচ্ছে
- error rate 1% এর বেশি
- readiness endpoint fail করছে
- socket ack fail বাড়ছে
- MongoDB ready metric 0 হচ্ছে
- Docker container restart হচ্ছে
- logs-এ timeout/error বাড়ছে

Quick VPS checks:

```bash
cd /opt/node-observability-lab
docker compose -f compose.prod.yml ps
curl http://127.0.0.1:3001/health/ready
docker compose -f compose.prod.yml logs --tail 100 app
```

## Recovery If Stress Test Breaks The App

On VPS:

```bash
ssh deploy@72.60.219.174
cd /opt/node-observability-lab
docker compose -f compose.prod.yml restart app
docker compose -f compose.prod.yml ps
curl http://127.0.0.1:3001/health/ready
```

If monitoring also becomes slow:

```bash
docker compose -f compose.prod.yml restart prometheus grafana loki promtail
```

## How To Increase Capacity

### Upgrade VPS

Most direct improvement:

```txt
1 CPU -> 2 CPU or 4 CPU
4 GB RAM -> 8 GB RAM
```

Node.js app and MongoDB-heavy traffic will benefit from more CPU and memory headroom.

### Run Multiple App Replicas

Later you can run multiple app containers behind Nginx:

```txt
Nginx -> app-1
      -> app-2
      -> app-3
```

But Socket.IO scaling needs sticky sessions or Redis adapter.

### Add Redis For Socket.IO

If multiple app instances are used, Socket.IO broadcasts need shared pub/sub.

Typical setup:

```txt
Socket.IO Redis adapter
Redis pub/sub
multiple Node.js app containers
```

### Reduce DB Writes

Current socket message sends immediately write to MongoDB.

Possible improvements:

- batch writes
- queue writes
- store only important messages
- add rate limiting per socket user
- separate worker process for heavy tasks

### Add Rate Limiting

Protect app from sudden spikes:

```txt
per IP HTTP limit
per socket message limit
max payload size
connection limit
```

### Add Caching

For read-heavy endpoints:

```txt
GET /api/messages
```

Could cache recent messages in memory or Redis to reduce MongoDB reads.

## Final Interpretation Of Your Result

Your app is not weak. For a 1 CPU VPS, this result is reasonable because the test is mixed and write-heavy.

Current result:

```txt
Stable: 150 RPS + 100 socket clients
Breaking: 200 RPS + 125 socket clients
Safe target: 75 RPS + 50 socket clients
```

If you need more than this, next best move is:

```txt
Upgrade to 2 CPU or 4 CPU
Add rate limiting
Optimize MongoDB writes
Plan horizontal Socket.IO scaling with Redis
```
