"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://backend:5000";

const TOTAL_STEPS = 45;

export default function Home() {

  // =========================================
  // INPUT STATES
  // =========================================
  const [repoLink, setRepoLink] = useState("");
  const [branch, setBranch] = useState("");
  const [websitePort, setWebsitePort] = useState("");

  // =========================================
  // PIPELINE STATES
  // =========================================
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [currentStage, setCurrentStage] = useState("");
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineCompleted, setPipelineCompleted] = useState(false);
  const [destroyRunning, setDestroyRunning] = useState(false);
  const [pipelineError, setPipelineError] = useState("");

  // =========================================
  // OUTPUT STATES
  // =========================================
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [artifactUrl, setArtifactUrl] = useState("");
  const [finalPort, setFinalPort] = useState("");

  // =========================================
  // AUTO DESTROY
  // =========================================
  const [countdown, setCountdown] = useState(120);
  const [showCountdown, setShowCountdown] = useState(false);

  // =========================================
  // BIT LOCK
  // =========================================
  const [pipelineBit, setPipelineBit] = useState(0);

  // =========================================
  // INPUT REFS
  // =========================================
  const repoRef = useRef<HTMLInputElement>(null);
  const branchRef = useRef<HTMLInputElement>(null);
  const portRef = useRef<HTMLInputElement>(null);

  // =========================================
  // LOAD SAVED STATE
  // =========================================
  useEffect(() => {

    const saved = localStorage.getItem("pipeline-state");

    if (saved) {

      const state = JSON.parse(saved);

      setRepoLink(state.repoLink || "");
      setBranch(state.branch || "");
      setWebsitePort(state.websitePort || "");
      setProgress(state.progress || 0);
      setStatus(state.status || "");
      setCurrentStage(state.currentStage || "");
      setPipelineRunning(state.pipelineRunning || false);
      setPipelineCompleted(state.pipelineCompleted || false);
      setWebsiteUrl(state.websiteUrl || "");
      setArtifactUrl(state.artifactUrl || "");
      setCountdown(state.countdown || 120);
      setShowCountdown(state.showCountdown || false);
      setPipelineBit(state.pipelineBit || 0);
      setPipelineError(state.pipelineError || "");

      // resume polling
      if (state.pipelineRunning) {
        pollPipeline();
      }
    }

  }, []);

  // =========================================
  // SAVE STATE
  // =========================================
  useEffect(() => {

    localStorage.setItem(
      "pipeline-state",
      JSON.stringify({
        repoLink,
        finalPort,
        branch,
        websitePort,
        progress,
        status,
        currentStage,
        pipelineRunning,
        pipelineCompleted,
        websiteUrl,
        artifactUrl,
        countdown,
        showCountdown,
        pipelineBit,
        pipelineError
      })
    );

  }, [
    repoLink,
    branch,
    websitePort,
    progress,
    status,
    currentStage,
    pipelineRunning,
    pipelineCompleted,
    websiteUrl,
    artifactUrl,
    countdown,
    showCountdown,
    pipelineBit,
    pipelineError
  ]);

  // =========================================
  // ENTER KEY FLOW
  // =========================================
  const handleKeyDown = (
    e: React.KeyboardEvent,
    nextRef?: React.RefObject<HTMLInputElement | null>
  ) => {

    if (e.key === "Enter") {

      e.preventDefault();

      if (nextRef?.current) {
        nextRef.current.focus();
      } else {
        handleApply();
      }
    }
  };

  // =========================================
  // APPLY
  // =========================================
  const handleApply = async () => {

    if (!repoLink || !branch || !websitePort) {
      return;
    }
    setFinalPort(websitePort);
    // =========================================
    // BIT CHECK
    // =========================================
    if (pipelineBit === 1) {
      alert("Pipeline already in use");
      return;
    }

    try {

      setPipelineBit(1);

      setPipelineRunning(true);

      setPipelineCompleted(false);

      setPipelineError("");

      setProgress(0);

      setWebsiteUrl("");

      setArtifactUrl("");

      setStatus("Initializing Pipeline");

      await axios.post(`${API}/apply`, {
        repoLink,
        branch,
        websitePort
      });

      pollPipeline();

    } catch (err) {

      console.log(err);

      setPipelineBit(0);

      setPipelineRunning(false);

      alert("Failed to trigger pipeline");
    }
  };

  // =========================================
  // POLL PIPELINE
  // =========================================
  const pollPipeline = () => {

    const interval = setInterval(async () => {

      try {

        const res = await axios.get(`${API}/status`);

        const data = res.data;

        setProgress(data.progress);

        setStatus(
          `${data.completedSteps}/${TOTAL_STEPS} Steps Completed`
        );

        if (data.currentJob && data.currentStep) {

          setCurrentStage(
            `${data.currentJob} → ${data.currentStep}`
          );
        }

        // =========================================
        // SUCCESS
        // =========================================
        if (
          data.status === "completed" &&
          data.conclusion === "success"
        ) {

          clearInterval(interval);

          setPipelineRunning(false);

          setPipelineCompleted(true);

          setProgress(100);

          // =========================================
          // GET EC2 IP
          // =========================================
          const ipRes = await axios.get(`${API}/ec2-ip`);

          const ip = ipRes.data.ip;

          setWebsiteUrl(
            `http://${ip}:${finalPort}`
          );

          setArtifactUrl(`${API}/artifacts`);

          // =========================================
          // START 2 MIN TIMER
          // =========================================
          setCountdown(120);

          setShowCountdown(true);
        }

        // =========================================
        // FAILURE
        // =========================================
        if (
          data.status === "completed" &&
          data.conclusion !== "success"
        ) {

          clearInterval(interval);

          setPipelineError(
            "There is an issue in the repo. Pipeline failed."
          );

          setPipelineRunning(false);

          setPipelineCompleted(false);

          // auto destroy immediately
          await handleDestroy(true);
        }

      } catch (err) {

        console.log(err);
      }

    }, 5000);
  };

  // =========================================
  // COUNTDOWN
  // =========================================
  useEffect(() => {

    if (!showCountdown) {
      return;
    }

    const timer = setInterval(() => {

      setCountdown((prev) => {

        if (prev <= 1) {

          clearInterval(timer);

          handleDestroy(true);

          return 0;
        }

        return prev - 1;
      });

    }, 1000);

    return () => clearInterval(timer);

  }, [showCountdown]);

  // =========================================
  // DESTROY
  // =========================================
  const handleDestroy = async (auto = false) => {

    try {

      setDestroyRunning(true);

      setShowCountdown(false);

      await axios.post(`${API}/destroy`);

      // =========================================
      // RESET EVERYTHING
      // =========================================
      localStorage.removeItem("pipeline-state");

      setPipelineBit(0);

      setRepoLink("");

      setBranch("");

      setWebsitePort("");

      setProgress(0);

      setStatus("");

      setCurrentStage("");

      setPipelineRunning(false);

      setPipelineCompleted(false);

      setDestroyRunning(false);

      setWebsiteUrl("");

      setArtifactUrl("");

      setPipelineError("");

      if (!auto) {
        alert("Infrastructure Destroyed");
      }

      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {

      console.log(err);

      setDestroyRunning(false);

      alert("Destroy failed");
    }
  };

  // =========================================
  // DOWNLOAD ARTIFACTS
  // =========================================
  const handleDownloadArtifacts = async () => {

    try {

      const res = await axios.get(`${API}/artifacts`);

      const link = document.createElement("a");

      link.href = res.data.downloadUrl;

      link.download = "security-reports.zip";

      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);

    } catch (err) {

      console.log(err);

      alert("Artifact download failed");
    }
  };

  // =========================================
  // APPLY BUTTON ENABLE
  // =========================================
  const applyEnabled =
    repoLink.trim() &&
    branch.trim() &&
    websitePort.trim() &&
    pipelineBit === 0 &&
    !pipelineRunning;

  return (

    <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center px-6">

      {/* ========================================= */}
      {/* TITLE */}
      {/* ========================================= */}
      <h1 className="text-6xl font-bold mb-12 text-center">
        DevSecOps CI/CD Portal
      </h1>

      {/* ========================================= */}
      {/* FORM */}
      {/* ========================================= */}
      {
        !pipelineRunning &&
        !pipelineCompleted &&
        !destroyRunning && (

          <div className="flex flex-col gap-5 w-full max-w-2xl">

            {/* REPO */}
            <input
              ref={repoRef}
              type="text"
              placeholder="GitHub Repository URL"
              value={repoLink}
              onChange={(e) => setRepoLink(e.target.value)}
              onKeyDown={(e) =>
                handleKeyDown(e, branchRef)
              }
              className="bg-[#111] border border-gray-700 rounded-xl p-5 text-lg outline-none focus:border-blue-500"
            />

            {/* BRANCH */}
            <input
              ref={branchRef}
              type="text"
              placeholder="Branch Name"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              onKeyDown={(e) =>
                handleKeyDown(e, portRef)
              }
              className="bg-[#111] border border-gray-700 rounded-xl p-5 text-lg outline-none focus:border-blue-500"
            />

            {/* PORT */}
            <input
              ref={portRef}
              type="text"
              placeholder="Website Running Port"
              value={websitePort}
              onChange={(e) => setWebsitePort(e.target.value)}
              onKeyDown={(e) =>
                handleKeyDown(e)
              }
              className="bg-[#111] border border-gray-700 rounded-xl p-5 text-lg outline-none focus:border-blue-500"
            />

            {/* APPLY BUTTON */}
            <button
              onClick={handleApply}
              disabled={!applyEnabled}
              className={`h-16 rounded-xl text-xl font-bold transition-all duration-300 ${
                applyEnabled
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-700 opacity-50 cursor-not-allowed"
              }`}
            >
              APPLY PIPELINE
            </button>

          </div>
        )
      }

      {/* ========================================= */}
      {/* PIPELINE PROGRESS */}
      {/* ========================================= */}
      {
        pipelineRunning && (

          <div className="w-full max-w-4xl mt-10 bg-[#111] border border-gray-800 rounded-2xl p-8">

            <div className="flex justify-between mb-5">

              <span className="text-2xl font-semibold">
                Pipeline Progress
              </span>

              <span className="text-2xl font-bold text-green-400">
                {progress}%
              </span>

            </div>

            {/* BAR */}
            <div className="w-full bg-gray-800 rounded-full h-8 overflow-hidden">

              <div
                className="h-8 bg-green-500 transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />

            </div>

            {/* STAGE */}
            <p className="mt-6 text-center text-blue-400 text-xl font-semibold">
              {currentStage}
            </p>

            {/* STATUS */}
            <p className="mt-3 text-center text-gray-300 text-lg">
              {status}
            </p>

          </div>
        )
      }

      {/* ========================================= */}
      {/* SUCCESS */}
      {/* ========================================= */}
      {
        pipelineCompleted &&
        !destroyRunning && (

          <div className="flex flex-col items-center gap-6 mt-10">

            <div className="bg-[#111] border border-green-700 rounded-2xl p-8 flex flex-col items-center gap-6">

              <h2 className="text-4xl font-bold text-green-400">
                Deployment Successful
              </h2>

              {/* WEBSITE BUTTON */}
              <button
                onClick={() => window.open(websiteUrl, "_blank")}
                className="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-xl text-xl font-bold"
              >
                View Running Application
              </button>

              {/* DOWNLOAD */}
              <button
                onClick={handleDownloadArtifacts}
                className="bg-green-600 hover:bg-green-700 px-8 py-4 rounded-xl text-xl font-bold"
              >
                Download Security Reports
              </button>

              {/* DESTROY */}
              <button
                onClick={() => handleDestroy()}
                className="bg-red-600 hover:bg-red-700 px-8 py-4 rounded-xl text-xl font-bold"
              >
                Destroy Infrastructure
              </button>

            </div>

            {/* ========================================= */}
            {/* SHOW ONLY WHEN 1 MIN LEFT */}
            {/* ========================================= */}
            {
              countdown <= 60 && (

                <div className="w-full max-w-2xl bg-[#221500] border border-yellow-600 rounded-xl p-5">

                  <div className="flex justify-between mb-2">

                    <span className="text-yellow-400 font-semibold">
                      Auto Destroy Timer
                    </span>

                    <span className="text-yellow-300">
                      {countdown}s
                    </span>

                  </div>

                  <div className="w-full bg-gray-700 h-3 rounded-full overflow-hidden">

                    <div
                      className="bg-yellow-500 h-3 transition-all duration-1000"
                      style={{
                        width: `${(countdown / 60) * 100}%`
                      }}
                    />

                  </div>

                </div>
              )
            }

          </div>
        )
      }

      {/* ========================================= */}
      {/* DESTROY RUNNING */}
      {/* ========================================= */}
      {
        destroyRunning && (

          <div className="w-full max-w-3xl mt-10 bg-[#1a0a0a] border border-red-700 rounded-2xl p-8">

            <h2 className="text-3xl font-bold text-red-400 text-center">
              Destroying Infrastructure...
            </h2>

            <div className="w-full bg-gray-800 h-4 rounded-full overflow-hidden mt-6">

              <div className="bg-red-500 h-4 w-full animate-pulse" />

            </div>

          </div>
        )
      }

      {/* ========================================= */}
      {/* ERROR */}
      {/* ========================================= */}
      {
        pipelineError && !destroyRunning && (

          <div className="mt-10 bg-[#2a0a0a] border border-red-700 rounded-2xl p-8 max-w-3xl">

            <h2 className="text-3xl font-bold text-red-400 text-center">
              Pipeline Failed
            </h2>

            <p className="mt-4 text-center text-gray-300 text-lg">
              {pipelineError}
            </p>

          </div>
        )
      }

    </div>
  );
}