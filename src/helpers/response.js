const response = (response = {}) => {
    const responseObject = {
        "status": response.status,
        "statusCode": response.statusCode,
        "message": response.message,
        "data": {},
        "errors": []
    };
    if (response.type) {
        responseObject.data.type = response.type;
    }
    if (response.data) {
        responseObject.data.attributes = response.data;
    }
    if (response.accessToken) {
        responseObject.data.accessToken = response.accessToken;
    }
    if (response.refreshToken) {
        responseObject.data.refreshToken = response.refreshToken;
    }
    if (response.signUpToken) {
        responseObject.data.signUpToken = response.signUpToken;
    }
    if (response.passcodeToken) {
        responseObject.data.passcodeToken = response.passcodeToken;
    }
    if (response.forgetPasswordToken) {
        responseObject.data.forgetPasswordToken = response.forgetPasswordToken;
    }
    if (response.errors) {
        responseObject.errors = response.errors;
    }

    return responseObject;
}

module.exports = response;
