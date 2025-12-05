// Create or update a user's graph
import { IdeaGraph } from "../models/ideaGraph.js";

export const saveGraph = async (req, res) => {
  try {
    const { id, title, nodes, edges } = req.body;
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
    if (title) graph.title = title;
    if (Array.isArray(nodes)) graph.nodes = nodes;
    if (Array.isArray(edges)) graph.edges = edges;
    graph.updatedAt = new Date();

    await graph.save();

    // Return a minimal patch (clientId -> _id/chatId) to hydrate newly saved nodes
    const nodePatch = Array.isArray(graph.nodes)
      ? graph.nodes.map((n) => ({
          id: n.id, // client-generated id
          _id: n._id, // Mongo subdocument id
          chatId: n.chatId || n.data?.chatId || undefined,
        }))
      : [];

    return res.status(200).json({ message: "Graph updated", nodes: nodePatch });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Failed to update graph" });
  }
};

// Load a user's graphs
export const getUserGraphs = async (req, res) => {
  try {
    const userId = req.user.id;
    const graphs = await IdeaGraph.find({ user: userId }).sort({
      updatedAt: -1,
    });
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
