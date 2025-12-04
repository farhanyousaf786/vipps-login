require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Vipps Login Backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/auth/health`);
});
