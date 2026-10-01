import express from "express";
import cors from "cors";
const app=express();
const port=Number(process.env.PORT||3000);
app.use(cors({origin:process.env.CORS_ORIGIN||"http://localhost:5173"}));
app.use(express.json());
app.get("/api/health",(_req,res)=>res.json({ok:true,service:"zyvox-session"}));
app.listen(port,()=>console.log(`Zyvox server listening on :${port}`));
