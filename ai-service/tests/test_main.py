from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'

def test_bengali_pricing_intent():
    response = client.post('/v1/process', json={'task':'intent','message':'আপনাদের দাম কত টাকা?'})
    assert response.status_code == 200
    assert response.json()['intent'] == 'pricing'

def test_empty_message_rejected():
    response = client.post('/v1/process', json={'task':'intent','message':''})
    assert response.status_code == 422
