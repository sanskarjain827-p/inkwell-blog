# Inkwell – Blog Platform with Comments

A full-stack blogging platform built for the Thiranex Full Stack Development internship (Task 4).

**Stack:** Node.js, Express, MongoDB (Mongoose), JWT, vanilla HTML/CSS/JS

## Features
- Registration and login (bcrypt-hashed passwords, JWT)
- Create, edit and delete posts; only the author can change their own posts
- Tags with tag filtering
- Comment on any post; comment authors and the post's author can delete comments
- Deleting a post removes its comments
- Clean, readable responsive layout

## REST API
| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Public |
| GET | `/api/posts?tag=`, `/api/posts/:id` | Public |
| POST | `/api/posts` | Logged in |
| PUT / DELETE | `/api/posts/:id` | Post author |
| GET | `/api/posts/:id/comments` | Public |
| POST | `/api/posts/:id/comments` | Logged in |
| DELETE | `/api/comments/:id` | Comment or post author |

## Run locally
```bash
npm install
cp .env.example .env   # MongoDB URI and JWT secret
npm start              # http://localhost:3000
```
