// Create or update a user's graph
import { IdeaGraph } from "../models/ideaGraph.js";
export const saveGraph = async (req, res) => {
  try {
    const { title, nodes, edges } = req.body;
    const userId = req.user.id; // from auth middleware

    // Find existing or create new
    let graph = await IdeaGraph.findOne({ user: userId, title });
    if (graph) {
      graph.nodes = nodes;
      graph.edges = edges;
      graph.updatedAt = new Date();
      await graph.save();
    } else {
      graph = await IdeaGraph.create({ user: userId, title, nodes, edges });
    }

    res.status(200).json({ message: "Graph saved", graph });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save graph" });
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
    const graph = await IdeaGraph.findOne({ _id: id, user: userId });
    if (!graph) return res.status(404).json({ error: "Graph not found" });
    res.status(200).json(graph);
  } catch (err) {
    res.status(500).json({ error: "Failed to load graph" });
  }
};
