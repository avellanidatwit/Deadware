using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

// .NET Framework host for Windows SCM. Node remains the only application server.
internal sealed class DeadwareService : ServiceBase
{
    private readonly string root, node, logDirectory;
    private Process child;
    private StreamWriter log;
    private readonly object logGate = new object();
    private readonly ManualResetEvent ready = new ManualResetEvent(false);
    private volatile bool stopping;

    private DeadwareService(string name, string root, string node, string logs)
    {
        ServiceName = name; this.root = Path.GetFullPath(root); this.node = Path.GetFullPath(node);
        logDirectory = Path.GetFullPath(logs); CanStop = true; CanShutdown = true; AutoLog = false;
    }
    private static string Quote(string text) { return "\"" + text + "\""; }
    private void WriteLog(string line)
    {
        lock (logGate) { if (log != null) { log.WriteLine(DateTime.UtcNow.ToString("o") + " " + line); log.Flush(); } }
    }
    private void StartChild(bool managed)
    {
        stopping = false; ready.Reset();
        Directory.CreateDirectory(logDirectory);
        string path = Path.Combine(logDirectory, "server.log");
        if (File.Exists(path) && new FileInfo(path).Length > 10 * 1024 * 1024) {
            string previous = path + ".1"; if (File.Exists(previous)) File.Delete(previous); File.Move(path, previous);
        }
        log = new StreamWriter(path, true);
        var info = new ProcessStartInfo(node, "--env-file=" + Quote(Path.Combine(root, ".env")) + " " + Quote(Path.Combine(root, "dist", "server", "src", "main.js")) + " --windows-service");
        info.WorkingDirectory = root; info.UseShellExecute = false; info.CreateNoWindow = true;
        info.RedirectStandardInput = true; info.RedirectStandardOutput = true; info.RedirectStandardError = true;
        child = new Process(); child.StartInfo = info; child.EnableRaisingEvents = true;
        child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) {
            if (e.Data == null) return; WriteLog(e.Data);
            if (e.Data.Contains("\"event\":\"server_started\"")) ready.Set();
        };
        child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) WriteLog(e.Data); };
        child.Exited += delegate {
            ready.Set();
            if (!stopping) { WriteLog("Node exited unexpectedly; Windows recovery may restart the service."); Environment.Exit(1); }
        };
        if (!child.Start()) throw new InvalidOperationException("Unable to launch Node.");
        child.BeginOutputReadLine(); child.BeginErrorReadLine();
        for (int i = 0; i < 45; i++) {
            if (ready.WaitOne(1000)) {
                if (child.HasExited) throw new InvalidOperationException("Server startup failed; inspect server.log.");
                WriteLog("Windows host ready."); return;
            }
            if (managed) RequestAdditionalTime(3000);
        }
        StopChild(managed); throw new System.TimeoutException("Server did not become ready within 45 seconds.");
    }
    private void StopChild(bool managed)
    {
        if (stopping) return; stopping = true;
        try {
            if (child != null && !child.HasExited) {
                if (managed) { try { RequestAdditionalTime(28000); } catch (InvalidOperationException) {} }
                WriteLog("Requesting final checkpoint and graceful shutdown.");
                try { child.StandardInput.WriteLine("DEADWARE_STOP"); child.StandardInput.Flush(); } catch (IOException) {}
                if (!child.WaitForExit(25000)) { WriteLog("Graceful shutdown timed out; terminating Node. Last successful checkpoint remains available."); child.Kill(); }
                child.WaitForExit();
            }
        } finally { if (child != null) child.Dispose(); lock (logGate) { if (log != null) { log.Dispose(); log = null; } } }
    }
    protected override void OnStart(string[] args) { StartChild(true); }
    protected override void OnStop() { StopChild(true); }
    protected override void OnShutdown() { StopChild(true); }
    public static int Main(string[] args)
    {
        bool verify = args.Length > 0 && args[0] == "--self-test";
        int offset = verify ? 1 : 0;
        if (args.Length != offset + 4) return 2;
        var service = new DeadwareService(args[offset], args[offset+1], args[offset+2], args[offset+3]);
        try {
            if (verify) { service.StartChild(false); service.StopChild(false); }
            else ServiceBase.Run(service);
            return 0;
        } catch (Exception) { service.WriteLog("Windows host failed. Check paths, permissions, .env, database and port availability."); service.StopChild(false); return 1; }
    }
}
