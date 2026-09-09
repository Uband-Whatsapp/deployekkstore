// api/update-profile.js
export default async function handler(req, res) {
  return res.status(200).json({ 
    success: true, 
    message: "update-profile.js is working!" 
  });
}