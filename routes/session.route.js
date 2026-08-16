import { Router } from "express";
import { getSessions, getSessionById } from '../controllers/session.controller.js';

const router = Router();

router.get("/", getSessions);
router.get("/:id", getSessionById);

export default router;
