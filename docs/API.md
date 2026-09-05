# 📡 ArmGuard RESTful API 接口规范手册

本文档提供 ArmGuard Linux 运维面板核心 RESTful API 规范，适用于自动化 CI/CD 集成、二次开发或外部监控程序对接。

---

## 1. 通用协议规范

- **基础路径 (Base URL)**: `http://<服务器IP>:8888/api/v1`
- **传输协议**: HTTP / HTTPS (JSON 格式交换)
- **身份认证**: 所有非开放接口均须在 HTTP 请求头中携带 Bearer Token：
  ```http
  Authorization: Bearer <your_access_token>
  ```
- **统一响应结构体**:
  ```json
  {
    "code": 0,
    "message": "提示信息",
    "data": { ... }
  }
  ```
  - `code === 0`：操作成功；
  - `code !== 0`：操作失败或鉴权异常（如 `400` 参数错误，`401` 未登录，`500` 内部错误）。

---

## 2. 核心接口列表

### 2.1 用户认证与凭据 (Auth)

#### 登录认证
- **请求**: `POST /api/v1/auth/login`
- **Body**:
  ```json
  {
    "username": "admin",
    "password": "your_password"
  }
  ```
- **返回**:
  ```json
  {
    "code": 0,
    "message": "登录成功",
    "data": {
      "token": "ag_live_xxxx...",
      "refresh_token": "ag_live_xxxx...",
      "expires_in": 86400,
      "user": { "id": 1, "username": "admin", "role": "admin" }
    }
  }
  ```

---

### 2.2 系统监控与 ARM 传感器 (System Telemetry)

#### 获取系统运行状态与硬件传感器数据
- **请求**: `GET /api/v1/system/status`
- **返回**:
  ```json
  {
    "code": 0,
    "message": "ok",
    "data": {
      "cpu_percent": 12.5,
      "memory_used_mb": 420,
      "memory_total_mb": 2048,
      "disk_used_gb": 15.2,
      "disk_total_gb": 60.0,
      "arm_sensors": {
        "temperature_celsius": 43.2,
        "throttled_state": "0x0",
        "is_undervoltage": false,
        "is_throttled": false,
        "voltage_v": 1.2
      },
      "network": {
        "rx_bytes_sec": 120500,
        "tx_bytes_sec": 45200
      }
    }
  }
  ```

---

### 2.3 网站管理与反向代理 / gRPC (Sites)

#### 获取站点列表
- **请求**: `GET /api/v1/sites`

#### 创建新站点
- **请求**: `POST /api/v1/sites`
- **Body**:
  ```json
  {
    "domain": "example.com",
    "domains": ["example.com", "www.example.com"],
    "path": "/www/wwwroot/example.com",
    "port": 80,
    "php_version": "php83",
    "proxy_enabled": false,
    "grpc_enabled": false,
    "rewrite_preset": "spa"
  }
  ```

#### 更新站点（支持 gRPC 模式与 PHP 多版本热切换）
- **请求**: `PUT /api/v1/sites/:id`
- **Body**:
  ```json
  {
    "proxy_enabled": true,
    "proxy_pass": "127.0.0.1:50051",
    "grpc_enabled": true,
    "websocket_enabled": true
  }
  ```

---

### 2.4 四层端口转发系统 (Layer 4 Stream Proxy)

#### 获取转发规则列表
- **请求**: `GET /api/v1/stream`

#### 创建四层转发规则
- **请求**: `POST /api/v1/stream`
- **Body**:
  ```json
  {
    "name": "MySQL 远程转发",
    "listen_port": 3307,
    "protocol": "tcp",
    "target_ip": "192.168.1.100",
    "target_port": 3306,
    "timeout_sec": 600,
    "remark": "内网数据库穿透"
  }
  ```

#### 规则一键启停 (Toggle)
- **请求**: `POST /api/v1/stream/:id/toggle`

#### 删除转发规则
- **请求**: `DELETE /api/v1/stream/:id`

---

### 2.5 SSL/TLS 证书中心 (Certbot ACME Engine)

#### 申请真实 Let's Encrypt 证书
- **请求**: `POST /api/v1/ssl/certs/apply`
- **Body**:
  ```json
  {
    "domain": "api.example.com",
    "email": "admin@example.com",
    "provider": "letsencrypt",
    "challenge_type": "http-01",
    "auto_deploy_site_id": 123
  }
  ```
- **返回**:
  ```json
  {
    "code": 0,
    "message": "Let's Encrypt 证书申请成功！",
    "data": {
      "id": 1788547239746,
      "domain": "api.example.com",
      "issuer": "Let's Encrypt (YE2)",
      "expires_at": "2026-12-03",
      "days_remaining": 90,
      "auto_renew": true
    }
  }
  ```

#### 证书一键续签
- **请求**: `POST /api/v1/ssl/certs/:id/renew`

---

### 2.6 数据库与备份流 (Databases)

#### 执行 SQL 查询
- **请求**: `POST /api/v1/databases/:id/query`
- **Body**:
  ```json
  {
    "sql": "SELECT id, name FROM users LIMIT 10;"
  }
  ```

#### 创建数据库物理备份
- **请求**: `POST /api/v1/databases/:id/backup`

#### 下载数据库 Gzip 备份包
- **请求**: `GET /api/v1/databases/backup/download?file_name=xxx.sql.gz&token=xxx`
- **响应头**:
  ```http
  Content-Type: application/gzip
  Content-Disposition: attachment; filename="xxx.sql.gz"
  ```
