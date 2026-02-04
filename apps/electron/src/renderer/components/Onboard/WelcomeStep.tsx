interface WelcomeStepProps {
  onStart: () => void;
  onCancel: () => void;
}

export default function WelcomeStep({ onStart, onCancel }: WelcomeStepProps) {
  return (
    <div className="onboard">
      <div className="onboard-card">
        <h1>Welcome to OpenClaw Desktop</h1>
        <p className="onboard-subtitle">
          Let's get you set up with a model provider to start using AI.
        </p>

        <div className="onboard-info">
          <h3>Supported Providers</h3>
          <ul>
            <li>
              <strong>OpenAI</strong> - GPT-5.2 (Codex) and more
            </li>
            <li>
              <strong>Google</strong> - Gemini 3 and more
            </li>
            <li>
              <strong>OpenRouter</strong> - Access to multiple models
            </li>
          </ul>
        </div>

        <div className="onboard-actions">
          <button className="btn btn-primary" onClick={onStart}>
            Get Started
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
