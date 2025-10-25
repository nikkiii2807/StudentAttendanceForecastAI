import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { AlertCircle, Users, Award, Calendar, Brain, AlertTriangle, CheckCircle, Upload, FileText, Activity } from 'lucide-react';
import Papa from 'papaparse';

const processCSVData = (csvData) => {
  const studentMap = new Map();
  
  csvData.forEach(row => {
    const studentId = row.student_id?.toString().trim();
    const studentName = row.student_name?.trim();
    const subject = row.subject?.trim();
    const date = row.date?.trim();
    const present = row.present?.toString().trim();
    const examNumber = row.exam_number?.toString().trim();
    const examScore = row.exam_score?.toString().trim();
    
    if (!studentId || !studentName) return;
    
    if (!studentMap.has(studentId)) {
      studentMap.set(studentId, {
        id: studentId,
        name: studentName,
        subject: subject || 'N/A',
        dailyAttendance: [],
        examScores: []
      });
    }
    
    const student = studentMap.get(studentId);
    
    if (date && present !== undefined && present !== null && present !== '') {
      const attendancePercent = parseFloat(present);
      if (!isNaN(attendancePercent)) {
        student.dailyAttendance.push({
          date: date,
          present: attendancePercent / 100
        });
      }
    }
    if (examNumber && examScore !== undefined && examScore !== null && examScore !== '') {
      const score = parseFloat(examScore);
      if (!isNaN(score)) {
        const existingExam = student.examScores.find(e => e.exam === parseInt(examNumber));
        if (!existingExam) {
          student.examScores.push({
            exam: parseInt(examNumber),
            score: score
          });
        }
      }
    }
  });
  
  const students = Array.from(studentMap.values()).map(student => {
    student.dailyAttendance.sort((a, b) => new Date(a.date) - new Date(b.date));
    student.dailyAttendance = student.dailyAttendance.map((att, idx) => ({
      ...att,
      day: idx + 1
    }));
    
    student.examScores.sort((a, b) => a.exam - b.exam);
    
    student.examScores = student.examScores.map(exam => {
      const attendanceUpToExam = student.dailyAttendance.slice(0, exam.exam * 30);
      const avgAttendance = attendanceUpToExam.length > 0 
        ? (attendanceUpToExam.reduce((sum, d) => sum + d.present, 0) / attendanceUpToExam.length) * 100
        : 0;
      
      return {
        ...exam,
        attendance: avgAttendance
      };
    });
    
    return student;
  });
  
  return students.filter(s => s.dailyAttendance.length > 0 || s.examScores.length > 0);
};

const forecastAttendanceWithSarimax = async (data, periods = 30, apiUrl = 'http://localhost:5000/forecast') => {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attendance_data: data,
        periods: periods
      })
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      return {
        forecast: result.forecast,
        method: result.method
      };
    } else {
      throw new Error(result.error || 'Unknown error from API');
    }
  } catch (error) {
    console.error('Sarimax API Error:', error);
    const avg = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0.5;
    return {
      forecast: Array(periods).fill(avg),
      method: 'fallback_average',
      error: error.message
    };
  }
};

const App = () => {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [forecastMethod, setForecastMethod] = useState('');
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('upload');
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [apiUrl, setApiUrl] = useState('http://localhost:5000/forecast');
  const [apiStatus, setApiStatus] = useState('unknown');
  
  useEffect(() => {
    checkApiHealth();
  }, [apiUrl]);
  
  useEffect(() => {
    if (selectedStudent && csvUploaded && !insights && !generatingInsights) {
      generateInsights();
    }
  }, [selectedStudent, csvUploaded]);
  
  const checkApiHealth = async () => {
    try {
      const healthUrl = apiUrl.replace('/forecast', '/health');
      const response = await fetch(healthUrl, { method: 'GET' });
      if (response.ok) {
        setApiStatus('connected');
      } else {
        setApiStatus('error');
      }
    } catch (error) {
      setApiStatus('disconnected');
    }
  };
  
  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    setUploadError('');
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors);
          }
          
          const cleanedData = results.data.map(row => {
            const cleanRow = {};
            Object.keys(row).forEach(key => {
              const cleanKey = key.trim();
              cleanRow[cleanKey] = row[key];
            });
            return cleanRow;
          });
          
          const requiredColumns = ['student_id', 'student_name', 'subject', 'date', 'present'];
          const headers = Object.keys(cleanedData[0] || {});
          const missingColumns = requiredColumns.filter(col => !headers.includes(col));
          
          if (missingColumns.length > 0) {
            setUploadError(`Missing required columns: ${missingColumns.join(', ')}`);
            setLoading(false);
            return;
          }
          
          const processedStudents = processCSVData(cleanedData);
          
          if (processedStudents.length === 0) {
            setUploadError('No valid student data found in CSV');
            setLoading(false);
            return;
          }
          
          setStudents(processedStudents);
          setSelectedStudent(processedStudents[0]);
          setCsvUploaded(true);
          setView('dashboard');
          setLoading(false);
        } catch (error) {
          setUploadError(`Error processing CSV: ${error.message}`);
          setLoading(false);
        }
      },
      error: (error) => {
        setUploadError(`Failed to parse CSV: ${error.message}`);
        setLoading(false);
      }
    });
  };
  
  const generateInsights = async () => {
    if (!selectedStudent) return;
    
    setGeneratingInsights(true);
    
    const attendanceData = selectedStudent.dailyAttendance.map(d => d.present);
    const result = await forecastAttendanceWithSarimax(attendanceData, 30, apiUrl);
    
    setForecastData(result.forecast);
    setForecastMethod(result.method);
    
    const insightData = await generateInsightsWithGroq(selectedStudent, result.forecast);
    setInsights(insightData);
    setGeneratingInsights(false);
  };
  
const generateInsightsWithGroq = async (student, forecast) => {
  const avgAttendance = student.dailyAttendance.length > 0
    ? student.dailyAttendance.slice(-30).reduce((sum, d) => sum + d.present, 0) / Math.min(30, student.dailyAttendance.length)
    : 0;

  const lastScore = student.examScores[student.examScores.length - 1]?.score || 0;
  const forecastAvg = forecast.length > 0 ? forecast.reduce((a, b) => a + b, 0) / forecast.length : 0;

  const prompt = `You are an AI academic analyst. Analyze this student data and provide insights in JSON format.

Student: ${student.name}
Subject: ${student.subject}
Recent 30-day Attendance: ${(avgAttendance * 100).toFixed(1)}%
Last Exam Score: ${lastScore.toFixed(1)}%
Forecasted 30-day Attendance: ${(forecastAvg * 100).toFixed(1)}%
Exam History: ${JSON.stringify(student.examScores.slice(-3))}

Provide a response in this EXACT JSON format (no markdown, just pure JSON):
{
  "summary": "Brief 2-3 sentence analysis of student performance and trends",
  "riskLevel": "low" or "medium" or "high",
  "failProbability": number between 0-100,
  "alerts": ["alert 1", "alert 2"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // updated to match Groq’s example
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) throw new Error(`API responded with status ${response.status}`);

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";

    let parsedInsights;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      parsedInsights = JSON.parse(cleanContent);

      if (!Array.isArray(parsedInsights.recommendations)) parsedInsights.recommendations = [];

    } catch (e) {
      console.warn("Failed to parse Groq response as JSON, using fallback");
      parsedInsights = {
        summary: content.substring(0, 200) || "Analysis complete. Review the charts for detailed trends.",
        riskLevel: avgAttendance < 0.6 || lastScore < 50 ? "high" : avgAttendance < 0.75 || lastScore < 70 ? "medium" : "low",
        failProbability: Math.round((1 - avgAttendance) * 50 + (1 - lastScore / 100) * 50),
        alerts: avgAttendance < 0.7 ? ["Low attendance detected"] : [],
        recommendations: [] // LLM will fill next time
      };
    }

    return parsedInsights;

  } catch (error) {
    console.error("Groq API error:", error);

    return {
      summary: `${student.name} has ${(avgAttendance * 100).toFixed(1)}% attendance and scored ${lastScore.toFixed(1)}% on the last exam.`,
      riskLevel: avgAttendance < 0.6 || lastScore < 50 ? "high" : avgAttendance < 0.75 || lastScore < 70 ? "medium" : "low",
      failProbability: Math.round((1 - avgAttendance) * 50 + (1 - lastScore / 100) * 50),
      alerts: [
        ...(avgAttendance < 0.7 ? ["Attendance below 70% threshold"] : []),
        ...(lastScore < 60 ? ["Recent exam performance concerning"] : [])
      ],
      recommendations: [] // no hardcoded recommendations
    };
  }
};


  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-700 font-medium">Processing CSV data...</p>
        </div>
      </div>
    );
  }
  
  if (!csvUploaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-200 max-w-2xl w-full">
          <div className="flex items-center justify-center mb-6">
            <Upload className="w-16 h-16 text-indigo-600" />
          </div>
          
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-3xl font-bold text-gray-900">Upload Student Data CSV</h2>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
              apiStatus === 'connected' ? 'bg-green-100 text-green-700' :
              apiStatus === 'disconnected' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              <Activity className="w-3 h-3" />
              {apiStatus === 'connected' ? 'API Connected' :
               apiStatus === 'disconnected' ? 'API Offline' :
               'Checking API...'}
            </div>
          </div>
          
          <p className="text-gray-600 mb-8 text-center">
            Upload a CSV file with your student attendance and exam data
          </p>
          
          <div className="mb-6">
            <div className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <FileText className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-700 mb-2">
                  Click to upload CSV file
                </p>
                <p className="text-sm text-gray-500">
                  or drag and drop
                </p>
              </label>
            </div>
          </div>
          
          {uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm font-medium">❌ {uploadError}</p>
            </div>
          )}
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Required CSV Columns:</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white p-3 rounded border border-gray-200">
                <code className="text-indigo-600 font-mono">student_id</code>
                <p className="text-gray-600 text-xs mt-1">Unique student identifier</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200">
                <code className="text-indigo-600 font-mono">student_name</code>
                <p className="text-gray-600 text-xs mt-1">Student's name</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200">
                <code className="text-indigo-600 font-mono">subject</code>
                <p className="text-gray-600 text-xs mt-1">Subject/course name</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200">
                <code className="text-indigo-600 font-mono">date</code>
                <p className="text-gray-600 text-xs mt-1">Date (YYYY-MM-DD)</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200">
                <code className="text-indigo-600 font-mono">present</code>
                <p className="text-gray-600 text-xs mt-1">1/0 or true/false</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200">
                <code className="text-indigo-600 font-mono">exam_number</code>
                <p className="text-gray-600 text-xs mt-1">Exam sequence number</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200 col-span-2">
                <code className="text-indigo-600 font-mono">exam_score</code>
                <p className="text-gray-600 text-xs mt-1">Score (0-100)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  const getAttendanceChartData = () => {
    if (!selectedStudent || !forecastData || forecastData.length === 0) return [];
    
    const historicalData = selectedStudent.dailyAttendance.slice(-60);
    const chartData = [];
    
    historicalData.forEach((d, idx) => {
      chartData.push({
        day: idx + 1,
        actual: d.present * 100,
        forecast: null
      });
    });
    
    forecastData.forEach((val, idx) => {
      chartData.push({
        day: historicalData.length + idx + 1,
        actual: null,
        forecast: val * 100
      });
    });
    
    return chartData;
  };
  
  const getRiskColor = (level) => {
    const colors = {
      low: 'text-green-600 bg-green-100',
      medium: 'text-yellow-600 bg-yellow-100',
      high: 'text-red-600 bg-red-100'
    };
    return colors[level] || colors.low;
  };
  
  const getAtRiskStudents = () => {
    return students
      .map(s => {
        const avgAtt = s.dailyAttendance.length > 0
          ? s.dailyAttendance.slice(-30).reduce((sum, d) => sum + d.present, 0) / Math.min(30, s.dailyAttendance.length)
          : 0;
        const lastScore = s.examScores[s.examScores.length - 1]?.score || 0;
        return {
          ...s,
          avgAttendance: avgAtt,
          lastScore,
          riskScore: (1 - avgAtt) * 0.4 + (1 - lastScore / 100) * 0.6
        };
      })
      .filter(s => s.riskScore > 0.4)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Brain className="w-8 h-8 text-indigo-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Student Forecast AI</h1>
                <p className="text-sm text-gray-600">Powered by Groq AI & Sarimax</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                apiStatus === 'connected' ? 'bg-green-100 text-green-700' :
                apiStatus === 'disconnected' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                <Activity className="w-4 h-4" />
                {apiStatus === 'connected' ? 'Sarimax API Connected' :
                 apiStatus === 'disconnected' ? 'API Offline - Using Fallback' :
                 'Checking...'}
              </div>
              <button
                onClick={() => {
                  setCsvUploaded(false);
                  setStudents([]);
                  setSelectedStudent(null);
                  setInsights(null);
                  setForecastData([]);
                }}
                className="px-3 py-2 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-sm flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload New CSV
              </button>
              <button
                onClick={() => setView('dashboard')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  view === 'dashboard' 
                    ? 'bg-indigo-600 text-black' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setView('individual')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  view === 'individual' 
                    ? 'bg-indigo-600 text-black' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Individual Analysis
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {view === 'dashboard' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Total Students</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{students.length}</p>
                  </div>
                  <Users className="w-12 h-12 text-blue-500 opacity-80" />
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 font-medium">At Risk</p>
                    <p className="text-3xl font-bold text-red-600 mt-1">
                      {getAtRiskStudents().length}
                    </p>
                  </div>
                  <AlertTriangle className="w-12 h-12 text-red-500 opacity-80" />
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Avg Attendance</p>
                    <p className="text-3xl font-bold text-green-600 mt-1">
                      {students.length > 0 ? (students.reduce((sum, s) => {
                        const recent = s.dailyAttendance.slice(-30);
                        return sum + (recent.length > 0 ? recent.reduce((a, d) => a + d.present, 0) / recent.length : 0);
                      }, 0) / students.length * 100).toFixed(1) : '0.0'}%
                    </p>
                  </div>
                  <Calendar className="w-12 h-12 text-green-500 opacity-80" />
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Avg Performance</p>
                    <p className="text-3xl font-bold text-indigo-600 mt-1">
                      {students.length > 0 ? (students.reduce((sum, s) => {
                        const lastScore = s.examScores[s.examScores.length - 1]?.score || 0;
                        return sum + lastScore;
                      }, 0) / students.length).toFixed(1) : '0.0'}%
                    </p>
                  </div>
                  <Award className="w-12 h-12 text-indigo-500 opacity-80" />
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <AlertCircle className="w-6 h-6 mr-2 text-red-600" />
                High-Risk Students (Immediate Attention Required)
              </h2>
              {getAtRiskStudents().length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No high-risk students identified</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Student</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Subject</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Attendance (30d)</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Last Score</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Risk Level</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getAtRiskStudents().map(student => (
                        <tr key={student.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{student.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{student.subject}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`font-semibold ${
                              student.avgAttendance < 0.6 ? 'text-red-600' : 
                              student.avgAttendance < 0.75 ? 'text-yellow-600' : 'text-green-600'
                            }`}>
                              {(student.avgAttendance * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`font-semibold ${
                              student.lastScore < 50 ? 'text-red-600' : 
                              student.lastScore < 70 ? 'text-yellow-600' : 'text-green-600'
                            }`}>
                              {student.lastScore.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              student.riskScore > 0.6 ? 'bg-red-100 text-red-700' :
                              student.riskScore > 0.4 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {student.riskScore > 0.6 ? 'HIGH' : student.riskScore > 0.4 ? 'MEDIUM' : 'LOW'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => {
                                setSelectedStudent(student);
                                setView('individual');
                              }}
                              className="text-sm bg-indigo-600 text-black px-3 py-1 rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select Student for Analysis
              </label>
              <select
                value={selectedStudent?.id}
                onChange={(e) => {
                  const student = students.find(s => s.id === e.target.value);
                  setSelectedStudent(student);
                  setInsights(null);
                  setForecastData([]);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} - {s.subject}
                  </option>
                ))}
              </select>
            </div>
            
            {generatingInsights ? (
              <div className="bg-white p-12 rounded-xl shadow-md border border-gray-200">
                <div className="flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600 mb-4"></div>
                  <p className="text-gray-700 font-medium">Generating forecasts with Sarimax...</p>
                  <p className="text-gray-500 text-sm mt-2">This may take 10-30 seconds</p>
                </div>
              </div>
            ) : insights ? (
              <>
                <div className={`p-6 rounded-xl shadow-md border-2 ${
                  insights.riskLevel === 'high' ? 'bg-red-50 border-red-300' :
                  insights.riskLevel === 'medium' ? 'bg-yellow-50 border-yellow-300' :
                  'bg-green-50 border-green-300'
                }`}>
                  <div className="flex items-start space-x-4">
                    <Brain className={`w-12 h-12 flex-shrink-0 ${
                      insights.riskLevel === 'high' ? 'text-red-600' :
                      insights.riskLevel === 'medium' ? 'text-yellow-600' :
                      'text-green-600'
                    }`} />
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">AI-Generated Insights (Groq AI)</h3>
                      <p className="text-gray-800 mb-4 leading-relaxed">{insights.summary}</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="bg-white p-4 rounded-lg shadow-sm">
                          <p className="text-sm font-semibold text-gray-700 mb-1">Risk Level</p>
                          <p className={`text-2xl font-bold uppercase ${getRiskColor(insights.riskLevel)} px-3 py-1 rounded-lg inline-block`}>
                            {insights.riskLevel}
                          </p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm">
                          <p className="text-sm font-semibold text-gray-700 mb-1">Probability of Failing Next Exam</p>
                          <p className="text-2xl font-bold text-red-600">{insights.failProbability}%</p>
                        </div>
                      </div>
                      
                      {insights.alerts && insights.alerts.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-semibold text-gray-900 mb-2">🚨 Alerts</p>
                          <div className="space-y-2">
                            {insights.alerts.map((alert, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-lg shadow-sm text-sm text-gray-800">
                                {alert}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {insights.recommendations && insights.recommendations.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">💡 Recommended Actions</p>
                          <div className="space-y-2">
                            {insights.recommendations.map((rec, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-lg shadow-sm flex items-start space-x-2">
                                <CheckCircle className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-gray-800">{rec}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">
                      Attendance Trend & 30-Day Forecast
                    </h3>
                    <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                      forecastMethod === 'sarimax' ? 'bg-indigo-100 text-indigo-700' :
                      forecastMethod === 'fallback_average' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {forecastMethod === 'nsarimax' ? '📈 SARIMAX Model' :
                       forecastMethod === 'fallback_average' ? '⚠️ Fallback: Average' :
                       'Processing...'}
                    </span>

                  </div>
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={getAttendanceChartData()}>
                      <defs>
                        <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.7}/>
                          <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="day" 
                        label={{ value: 'Days', position: 'insideBottom', offset: -5 }}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis 
                        label={{ value: 'Attendance %', angle: -90, position: 'insideLeft' }}
                        tick={{ fontSize: 12 }}
                        domain={[0, 100]}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                        formatter={(value, name) => {
                          if (value === null) return ['N/A', name];
                          return [`${value.toFixed(1)}%`, name === 'actual' ? 'Historical' : 'SARIMAX Forecast'];
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ paddingTop: '20px' }}
                        formatter={(value) => value === 'actual' ? 'Historical Attendance' : 'SARIMAX Forecast'}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="actual" 
                        stroke="#4f46e5" 
                        strokeWidth={3}
                        fill="url(#colorActual)"
                        name="actual"
                        connectNulls={false}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="forecast" 
                        stroke="#a78bfa" 
                        strokeWidth={3}
                        strokeDasharray="8 4"
                        fill="url(#colorForecast)"
                        name="forecast"
                        connectNulls={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-6 flex items-center justify-center space-x-8 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-3 bg-gradient-to-b from-indigo-600 to-indigo-200 rounded"></div>
                      <span className="text-gray-700 font-medium">Historical (Last 60 days)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-3 bg-gradient-to-b from-purple-400 to-purple-100 rounded border-2 border-dashed border-purple-500"></div>
                      <span className="text-gray-700 font-medium">Forecast (Next 30 days)</span>
                    </div>
                  </div>
                </div>
                
                {selectedStudent.examScores.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      Exam Performance vs Attendance
                    </h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={selectedStudent.examScores}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="exam" 
                          label={{ value: 'Exam Number', position: 'insideBottom', offset: -5 }}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                          yAxisId="left" 
                          label={{ value: 'Score %', angle: -90, position: 'insideLeft' }}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                          yAxisId="right" 
                          orientation="right" 
                          label={{ value: 'Attendance %', angle: 90, position: 'insideRight' }}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                          formatter={(value) => `${value.toFixed(1)}%`}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                        <Line 
                          yAxisId="left" 
                          type="monotone" 
                          dataKey="score" 
                          stroke="#10b981" 
                          strokeWidth={3} 
                          name="Exam Score %" 
                          dot={{ fill: '#10b981', r: 5 }}
                        />
                        <Line 
                          yAxisId="right" 
                          type="monotone" 
                          dataKey="attendance" 
                          stroke="#6366f1" 
                          strokeWidth={3} 
                          name="Attendance %" 
                          dot={{ fill: '#6366f1', r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;