import { Router } from "express";
import { getSessions, getSessionById, createSession, updateSession, deleteSession } from '../controllers/session.controller.js';

const router = Router();

router.get("/", getSessions);
router.post("/", createSession);
router.patch("/:id", updateSession);
router.delete("/:id", deleteSession);

export default router;
