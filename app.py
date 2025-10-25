from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from neuralprophet import NeuralProphet
from statsmodels.tsa.statespace.sarimax import SARIMAX
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'message': 'Sarimax API is running'}), 200



@app.route('/forecast', methods=['POST'])

def forecast_attendance():
    try:
        data = request.json
        attendance_data = data.get('attendance_data', [])
        periods = data.get('periods', 30)

        if len(attendance_data) < 1:
            raise ValueError("No attendance data provided")

        recent_data = attendance_data
        
        # Use hybrid approach: decomposition + SARIMA for better forecasts
        if len(recent_data) < 14:
            # Too little data, use simple average with noise
            avg = np.mean(recent_data)
            std = np.std(recent_data)
            forecast_values = [avg + np.random.normal(0, std * 0.1) for _ in range(periods)]
            forecast_values = np.clip(forecast_values, 0, 1).tolist()
            return jsonify({'success': True, 'forecast': forecast_values, 'method': 'simple_average'})
        
        # Calculate weekly pattern (day of week seasonality)
        weekly_pattern = np.zeros(7)
        weekly_counts = np.zeros(7)
        
        for i, val in enumerate(recent_data):
            day_idx = i % 7
            weekly_pattern[day_idx] += val
            weekly_counts[day_idx] += 1
        
        weekly_pattern = weekly_pattern / np.maximum(weekly_counts, 1)
        weekly_mean = np.mean(weekly_pattern)
        weekly_factors = weekly_pattern / weekly_mean if weekly_mean > 0 else np.ones(7)
        
        # Calculate recent trend
        window = min(14, len(recent_data))
        recent_trend = np.mean(recent_data[-window:]) - np.mean(recent_data[-2*window:-window]) if len(recent_data) >= 2*window else 0
        
        try:
            # Use SARIMA with better parameters
            model = SARIMAX(
                recent_data,
                order=(2, 0, 2),              # More AR/MA terms, no differencing
                seasonal_order=(1, 0, 1, 7),  # Weekly seasonality
                enforce_stationarity=False,
                enforce_invertibility=False,
                trend='c'                      # Include constant
            )
            
            model_fit = model.fit(disp=False, maxiter=200, method='lbfgs')
            
            # Generate forecast
            forecast = model_fit.forecast(steps=periods)
            forecast_values = forecast
            
        except Exception as e:
            print(f"SARIMA failed: {str(e)}, using alternative")
            # Fallback: use trend + seasonality manually
            base_value = np.mean(recent_data[-7:])
            forecast_values = []
            
            for i in range(periods):
                day_idx = (len(recent_data) + i) % 7
                seasonal_component = base_value * weekly_factors[day_idx]
                trend_component = recent_trend * (i / 7) * 0.5  # Dampened trend
                value = seasonal_component + trend_component
                forecast_values.append(value)
            
            forecast_values = np.array(forecast_values)
        
        # Apply weekly seasonality more strongly
        for i in range(len(forecast_values)):
            day_idx = (len(recent_data) + i) % 7
            forecast_values[i] = forecast_values[i] * (0.7 + 0.3 * weekly_factors[day_idx])
        
        # Add realistic fluctuations
        std = np.std(recent_data)
        noise = np.random.normal(0, std * 0.08, size=len(forecast_values))
        forecast_values = forecast_values + noise
        
        # Smooth slightly to avoid sharp jumps
        if len(forecast_values) >= 3:
            forecast_values = np.convolve(forecast_values, [0.25, 0.5, 0.25], mode='same')
        
        # Clip to valid range
        forecast_values = np.clip(forecast_values, 0, 1).tolist()
        
        return jsonify({
            'success': True,
            'forecast': forecast_values,
            'method': 'sarima_enhanced'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


if __name__ == '__main__':
    print("Starting SARIMAX Forecasting API on port 5000...")
    app.run(debug=True, port=5000, host='0.0.0.0')
