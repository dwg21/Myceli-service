// Create or update a user's graph
import mongoose from "mongoose";
import { IdeaGraph } from "../models/ideaGraph.js";
import { Chat } from "../models/Chat.js";

export const saveGraph = async (req, res) => {
  try {
    const { id, title, nodes, edges, meta } = req.body;
    const userId = req.user?.id;

    // --- validation ---
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!id) {
      return res.status(400).json({ error: "Graph ID is required" });
    }

    // --- find existing graph ---
    const graph = await IdeaGraph.findOne({ _id: id, user: userId });
    if (!graph) {
      return res.status(404).json({ error: "Graph not found" });
    }

    // --- update existing graph ---
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const titleFromNodes = Array.isArray(nodes)
      ? nodes
          .map((n) => n?.data?.label || n?.label || "")
          .find((t) => typeof t === "string" && t.trim() !== "")
      : "";

    const resolvedTitle =
      normalizedTitle || titleFromNodes || graph.title || "Untitled Graph";

    graph.title = resolvedTitle;
    // sanitize nodes to remove duplicate top-level props; keep only id/type/position/data/chatId/graphId
    const metaPrompt =
      (meta && meta.originalPrompt) || graph.meta?.originalPrompt || "";
    const metaContext =
      (meta && meta.originalContext) || graph.meta?.originalContext || "";

    const cleanNodes = Array.isArray(nodes)
      ? nodes.map((n) => {
          const data = typeof n.data === "object" && n.data ? { ...n.data } : {};
          const history = data.history;
          const isRoot = n.id === "root" || n.type === "brain";
          let cleanedHistory;
          if (history && typeof history === "object") {
            const ancestors = Array.isArray(history.ancestors)
              ? history.ancestors
              : [];
            cleanedHistory = {
              ancestors,
              ...(isRoot || (!metaPrompt && history.originalPrompt)
                ? history.originalPrompt
                  ? { originalPrompt: history.originalPrompt }
                  : {}
                : {}),
              ...(isRoot || (!metaContext && history.originalContext)
                ? history.originalContext
                  ? { originalContext: history.originalContext }
                  : {}
                : {}),
            };
          }
          if (metaPrompt && cleanedHistory) {
            // Prefer meta over per-node prompt/context
            delete cleanedHistory.originalPrompt;
          }
          if (metaContext && cleanedHistory) {
            delete cleanedHistory.originalContext;
          }
          if (cleanedHistory) {
            data.history = cleanedHistory;
          }
          const cleanGraphId =
            n.graphId && mongoose.Types.ObjectId.isValid(n.graphId)
              ? n.graphId
              : data.graphId && mongoose.Types.ObjectId.isValid(data.graphId)
                ? data.graphId
                : undefined;
          return {
            id: n.id,
            type: n.type,
            position: n.position,
            data,
            chatId: n.chatId || n.data?.chatId || undefined,
            ...(cleanGraphId ? { graphId: cleanGraphId } : {}),
          };
        })
      : [];

    // sanitize edges: drop default style if empty/undefined
    const cleanEdges = Array.isArray(edges)
      ? edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          ...(e.style ? { style: e.style } : {}),
        }))
      : [];

    if (Array.isArray(nodes)) graph.nodes = cleanNodes;
    if (Array.isArray(edges)) graph.edges = cleanEdges;

    // store shared meta (original prompt/context)
    if (meta && typeof meta === "object") {
      graph.meta = {
        originalPrompt: meta.originalPrompt || graph.meta?.originalPrompt || "",
        originalContext:
          meta.originalContext || graph.meta?.originalContext || "",
      };
    }
    graph.updatedAt = new Date();

    await graph.save();

    // Return a minimal patch (clientId -> _id/chatId) plus meta
    const nodePatch = Array.isArray(graph.nodes)
      ? graph.nodes.map((n) => ({
          id: n.id, // client-generated id
          _id: n._id, // Mongo subdocument id
          chatId: n.chatId || n.data?.chatId || undefined,
        }))
      : [];

    return res
      .status(200)
      .json({
        message: "Graph updated",
        nodes: nodePatch,
        meta: graph.meta,
      });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Failed to update graph" });
  }
};

// Load a user's graphs
export const getUserGraphs = async (req, res) => {
  try {
    const userId = req.user.id;

    const graphs = await IdeaGraph.find({ user: userId })
      .sort({ updatedAt: -1 })
      .select("_id id title updatedAt");

    res.status(200).json({ graphs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch graphs" });
  }
};

// Load a specific graph by ID
export const getGraphById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    console.log("searching grpahs with", id, userId);
    const graph = await IdeaGraph.findOne({ _id: id, user: userId });
    if (!graph) return res.status(404).json({ error: "Graph not found" });
    res.status(200).json(graph);
  } catch (err) {
    res.status(500).json({ error: "Failed to load graph" });
  }
};

// Delete a user's graph and any associated chats
export const deleteGraph = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id) {
      return res.status(400).json({ error: "Graph ID is required" });
    }

    const graph = await IdeaGraph.findOne({ _id: id, user: userId });
    if (!graph) {
      return res.status(404).json({ error: "Graph not found" });
    }

    // Remove all chats the user owns that reference this graph
    await Chat.deleteMany({ createdBy: userId, graphId: id });

    await graph.deleteOne();

    return res
      .status(200)
      .json({ message: "Graph and related chats deleted successfully" });
  } catch (err) {
    console.error("Failed to delete graph:", err);
    return res.status(500).json({ error: "Failed to delete graph" });
  }
};
