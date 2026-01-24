import crypto from "crypto";
import { IdeaGraph } from "../models/ideaGraph.js";
import { ShareLink } from "../models/ShareLink.js";
import { Chat } from "../models/Chat.js";

const SHARE_ID_BYTES = 8;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const sanitizeGraphSnapshot = (graphDoc) => {
  if (!graphDoc) return null;
  const plain = graphDoc.toObject ? graphDoc.toObject() : graphDoc;

  // Strip chat references from nodes before sharing publicly
  const meta = plain.meta || {};
  const hasMetaPrompt = Boolean(meta.originalPrompt);
  const hasMetaContext = Boolean(meta.originalContext);

  const nodes = Array.isArray(plain.nodes)
    ? plain.nodes.map((n) => {
        const node = { ...n };
        delete node.chatId;
        if (node.data && typeof node.data === "object") {
          const clonedData = { ...node.data };
          delete clonedData.chatId;
          // Remove duplicated prompt/context if meta exists
          if (clonedData.history && typeof clonedData.history === "object") {
            const history = { ...clonedData.history };
            if (hasMetaPrompt) delete history.originalPrompt;
            if (hasMetaContext) delete history.originalContext;
            clonedData.history = history;
          }
          node.data = clonedData;
        }
        return node;
      })
    : [];

  return {
    graphId: plain._id?.toString(),
    title: plain.title,
    updatedAt: plain.updatedAt,
    meta,
    nodes,
    edges: plain.edges || [],
  };
};

const buildShareId = () =>
  crypto.randomBytes(SHARE_ID_BYTES).toString("hex").slice(0, 2 * SHARE_ID_BYTES);

export const createShareLink = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { graphId } = req.body || {};

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!graphId) {
      return res.status(400).json({ error: "Graph ID is required" });
    }

    const graph = await IdeaGraph.findOne({ _id: graphId, user: userId });
    if (!graph) {
      return res.status(404).json({ error: "Graph not found" });
    }

    const snapshot = sanitizeGraphSnapshot(graph);
    if (!snapshot) {
      return res.status(500).json({ error: "Unable to snapshot graph" });
    }

    let shareLink = await ShareLink.findOne({
      graph: graph._id,
      createdBy: userId,
      active: true,
    });

    if (shareLink) {
      shareLink.snapshot = snapshot;
      shareLink.updatedAt = new Date();
      shareLink.expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);
      await shareLink.save();
    } else {
      const shareId = buildShareId();
      shareLink = await ShareLink.create({
        shareId,
        graph: graph._id,
        createdBy: userId,
        snapshot,
        expiresAt: new Date(Date.now() + DEFAULT_TTL_MS),
      });
    }

    return res.status(201).json({
      shareId: shareLink.shareId,
      url: `/share/${shareLink.shareId}`,
      snapshot,
      createdAt: shareLink.createdAt,
    });
  } catch (err) {
    console.error("Failed to create share link:", err);
    return res.status(500).json({ error: "Failed to create share link" });
  }
};

export const getShareLinkForGraph = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { graphId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!graphId) {
      return res.status(400).json({ error: "Graph ID is required" });
    }

    const share = await ShareLink.findOne({
      graph: graphId,
      createdBy: userId,
      active: true,
    });

    if (!share) {
      return res.status(404).json({ error: "No share link for this graph" });
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ error: "Shared link has expired" });
    }

    return res.status(200).json({
      shareId: share.shareId,
      url: `/share/${share.shareId}`,
      snapshot: sanitizeGraphSnapshot(share.snapshot),
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
      expiresAt: share.expiresAt,
    });
  } catch (err) {
    console.error("Failed to fetch share link for graph:", err);
    return res.status(500).json({ error: "Failed to fetch share link" });
  }
};

export const getSharedGraph = async (req, res) => {
  try {
    const { shareId } = req.params;
    if (!shareId) {
      return res.status(400).json({ error: "Missing shareId" });
    }

    const share = await ShareLink.findOne({ shareId, active: true });
    if (!share) {
      return res.status(404).json({ error: "Shared graph not found" });
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ error: "Shared link has expired" });
    }

    return res.status(200).json({
      shareId: share.shareId,
      snapshot: sanitizeGraphSnapshot(share.snapshot),
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
      expiresAt: share.expiresAt,
      createdBy: share.createdBy,
    });
  } catch (err) {
    console.error("Failed to fetch shared graph:", err);
    return res.status(500).json({ error: "Failed to fetch shared graph" });
  }
};

export const getSharedChat = async (req, res) => {
  try {
    const { shareId, chatId } = req.params;
    if (!shareId || !chatId) {
      return res.status(400).json({ error: "Missing shareId or chatId" });
    }

    const share = await ShareLink.findOne({ shareId, active: true });
    if (!share) {
      return res.status(404).json({ error: "Shared graph not found" });
    }
    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ error: "Shared link has expired" });
    }

    const chat = await Chat.findOne({
      _id: chatId,
      createdBy: share.createdBy,
      graphId: share.graph,
    }).lean();

    if (!chat) {
      return res.status(404).json({ error: "Chat not found for this share" });
    }

    return res.status(200).json({
      chatId: chat._id,
      title: chat.title,
      history: chat.history,
      messages: chat.messages,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    });
  } catch (err) {
    console.error("Failed to fetch shared chat:", err);
    return res.status(500).json({ error: "Failed to fetch shared chat" });
  }
};
