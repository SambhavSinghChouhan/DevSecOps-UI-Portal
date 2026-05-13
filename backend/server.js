const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const headers = {
  Authorization: `Bearer ${process.env.GB_TOKEN}`,
  Accept: "application/vnd.github+json"
};

const OWNER = process.env.OWNER;
const REPO = process.env.REPO;

// ======================================
// APPLY API
// ======================================
app.post("/apply", async (req, res) => {

  try {

    const { repoLink, branch, websitePort } = req.body;

    await axios.patch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/variables/GBLINK`,
      { name: "GBLINK", value: repoLink },
      { headers }
    );

    await axios.patch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/variables/BRANCH`,
      { name: "BRANCH", value: branch },
      { headers }
    );

    await axios.patch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/variables/WEBSITE_PORT`,
      { name: "WEBSITE_PORT", value: websitePort },
      { headers }
    );

    await axios.post(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/terraform.yml/dispatches`,
      {
        ref: "main",
        inputs: { action: "apply" }
      },
      { headers }
    );

    res.json({ message: "Pipeline Triggered Successfully" });

  } catch (err) {

    console.log(err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

// ======================================
// DESTROY API
// ======================================
app.post("/destroy", async (req, res) => {

  try {

    await axios.post(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/terraform.yml/dispatches`,
      {
        ref: "main",
        inputs: { action: "destroy" }
      },
      { headers }
    );

    res.json({ message: "Destroy Triggered" });

  } catch (err) {

    console.log(err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

// ======================================
// PIPELINE STATUS API
// ======================================
app.get("/status", async (req, res) => {

  try {

    const response = await axios.get(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs`,
      { headers }
    );

    const latestRun = response.data.workflow_runs[0];

    const jobsResponse = await axios.get(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${latestRun.id}/jobs`,
      { headers }
    );

    const jobs = jobsResponse.data.jobs;

    const TOTAL_PIPELINE_STEPS = 45;

    let completedSteps = 0;
    let currentJob = "";
    let currentStep = "";

    jobs.forEach(job => {

      const steps = job.steps || [];

      steps.forEach(step => {

        if (
          step.name.toLowerCase().includes("post") ||
          step.name.toLowerCase().includes("complete job")
        ) {
          return;
        }

        if (
          step.status === "completed" &&
          step.conclusion === "success"
        ) {
          completedSteps++;
        }

        if (step.status === "in_progress") {
          currentJob = job.name;
          currentStep = step.name;
        }

      });

    });

    let progress = Math.floor(
      (completedSteps / TOTAL_PIPELINE_STEPS) * 100
    );

    if (
      latestRun.status !== "completed" &&
      progress >= 100
    ) {
      progress = 99;
    }

    res.json({
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      progress,
      completedSteps,
      totalSteps: TOTAL_PIPELINE_STEPS,
      currentJob,
      currentStep
    });

  } catch (err) {

    console.log(err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

// ======================================
// 🔥 FIXED ARTIFACT DOWNLOAD API
// ======================================
app.get("/artifacts", async (req, res) => {

  try {

    const response = await axios.get(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/artifacts`,
      { headers }
    );

    const artifacts = response.data.artifacts;

    const reportsArtifact = artifacts.find(
      a => a.name === "security-reports"
    );

    if (!reportsArtifact) {
      return res.status(404).json({
        error: "Security reports artifact not found"
      });
    }

    // 🔥 NEW FIX: REAL DOWNLOAD ENDPOINT (NO NIGHTLY LINK)
const downloadUrl =
  `${req.protocol}://${req.get("host")}/download-artifact/${reportsArtifact.id}`;

    res.json({ downloadUrl });

  } catch (err) {

    console.log(err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

// ======================================
// 🔥 NEW: STREAM ARTIFACT DOWNLOAD
// ======================================
app.get("/download-artifact/:id", async (req, res) => {

  try {

    const artifactId = req.params.id;

    const response = await axios.get(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/artifacts/${artifactId}/zip`,
      {
        headers,
        responseType: "stream"
      }
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=security-reports.zip"
    );

    response.data.pipe(res);

  } catch (err) {

    console.log(err.response?.data || err.message);

    res.status(500).send("Artifact download failed");
  }
});

// ======================================
// EC2 IP API
// ======================================
app.get("/ec2-ip", async (req, res) => {

  try {

    const response = await axios.get(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/variables/EC2_IP`,
      { headers }
    );

    res.json({
      ip: response.data.value
    });

  } catch (err) {

    console.log(err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

// ======================================
// START SERVER
// ======================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {

  console.log(`Server running on port ${PORT}`);

});