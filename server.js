require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { MONGODB_URI, JWT_SECRET = 'dev-secret', PORT = 3000 } = process.env;
const { Schema, model } = mongoose;

// ---------- Models ----------
const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }
}, { timestamps: true }));

const Post = model('Post', new Schema({
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  body: { type: String, required: true },
  tags: [{ type: String, trim: true, lowercase: true }]
}, { timestamps: true }));

const Comment = model('Comment', new Schema({
  post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 }
}, { timestamps: true }));

// ---------- App ----------
const app = express();
app.use(express.json({ limit: '200kb' }));
// Frontend files live at the repo root; only these are served
const PUBLIC_FILES = ['app.js','index.html','style.css'];
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/:file', (req, res, next) =>
  PUBLIC_FILES.includes(req.params.file) ? res.sendFile(path.join(__dirname, req.params.file)) : next());

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const sign = (u) => jwt.sign({ id: u._id, name: u.name }, JWT_SECRET, { expiresIn: '7d' });
function auth(req, res, next) {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Please log in' }); }
}
const tagsOf = (t) => (Array.isArray(t) ? t : String(t || '').split(',')).map((s) => s.trim()).filter(Boolean).slice(0, 5);

// Auth
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a 6+ character password are required' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'Email already registered' });
  const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: sign(user), user: { id: user._id, name: user.name } });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password)))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(user), user: { id: user._id, name: user.name } });
}));

// Posts
app.get('/api/posts', wrap(async (req, res) => {
  const filter = req.query.tag ? { tags: req.query.tag.toLowerCase() } : {};
  const posts = await Post.find(filter).populate('author', 'name').sort({ createdAt: -1 }).lean();
  const counts = await Comment.aggregate([{ $group: { _id: '$post', n: { $sum: 1 } } }]);
  const byId = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json(posts.map((p) => ({ ...p, body: p.body.slice(0, 220), comments: byId[p._id] || 0 })));
}));
app.get('/api/posts/:id', wrap(async (req, res) => {
  const post = await Post.findById(req.params.id).populate('author', 'name');
  post ? res.json(post) : res.status(404).json({ error: 'Post not found' });
}));
app.post('/api/posts', auth, wrap(async (req, res) => {
  const { title, body, tags } = req.body;
  res.status(201).json(await Post.create({ author: req.user.id, title, body, tags: tagsOf(tags) }));
}));
app.put('/api/posts/:id', auth, wrap(async (req, res) => {
  const { title, body, tags } = req.body;
  const post = await Post.findOneAndUpdate({ _id: req.params.id, author: req.user.id },
    { title, body, tags: tagsOf(tags) }, { new: true, runValidators: true });
  post ? res.json(post) : res.status(403).json({ error: 'You can only edit your own posts' });
}));
app.delete('/api/posts/:id', auth, wrap(async (req, res) => {
  const post = await Post.findOneAndDelete({ _id: req.params.id, author: req.user.id });
  if (!post) return res.status(403).json({ error: 'You can only delete your own posts' });
  await Comment.deleteMany({ post: post._id });
  res.json({ ok: true });
}));

// Comments
app.get('/api/posts/:id/comments', wrap(async (req, res) =>
  res.json(await Comment.find({ post: req.params.id }).populate('author', 'name').sort({ createdAt: 1 }))));
app.post('/api/posts/:id/comments', auth, wrap(async (req, res) => {
  if (!(await Post.exists({ _id: req.params.id }))) return res.status(404).json({ error: 'Post not found' });
  const c = await Comment.create({ post: req.params.id, author: req.user.id, text: req.body.text });
  res.status(201).json(await c.populate('author', 'name'));
}));
// Comment author or the post's author can delete a comment
app.delete('/api/comments/:id', auth, wrap(async (req, res) => {
  const c = await Comment.findById(req.params.id).populate('post', 'author');
  if (!c) return res.status(404).json({ error: 'Comment not found' });
  if (String(c.author) !== req.user.id && String(c.post?.author) !== req.user.id)
    return res.status(403).json({ error: 'Not allowed' });
  await c.deleteOne();
  res.json({ ok: true });
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use((err, req, res, next) => {
  if (['ValidationError', 'CastError'].includes(err.name)) return res.status(400).json({ error: err.message });
  console.error(err); res.status(500).json({ error: 'Server error' });
});

mongoose.connect(MONGODB_URI)
  .then(() => app.listen(PORT, () => console.log(`Inkwell running on :${PORT}`)))
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
