package org.example.health;

// A concrete entry activity for this runtime qualification app. The runtime's
// stock manifest expects NativeScriptActivity to be contributed by the app.
public class HealthActivity extends android.app.Activity {
    @Override
    public void onCreate(android.os.Bundle state) {
        super.onCreate(state);
        android.widget.TextView view = new android.widget.TextView(this);
        view.setText(Health.value());
        setContentView(view);
    }
}
