package com.example.clearkyc.web.dto;

import com.example.clearkyc.domain.DecisionType;

import java.util.Map;

public record FinalizeRequest(
        DecisionType decision,
        Map<String, Object> extractedData,
        Map<String, String> overrideJustifications) {
}
