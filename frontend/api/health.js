module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.json({ 
    status: 'ok', 
    serverless: true,
    timestamp: new Date().toISOString()
  });
};
