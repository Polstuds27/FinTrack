from rest_framework import serializers


class MutationSerializer(serializers.Serializer):
    client_mutation_id = serializers.CharField(max_length=64)
    entity = serializers.CharField(max_length=64)
    entity_id = serializers.UUIDField()
    op = serializers.ChoiceField(choices=["create", "update", "delete"])
    base_version = serializers.IntegerField(min_value=0, default=0)
    client_timestamp = serializers.DateTimeField(required=False)
    payload = serializers.JSONField(required=False, default=dict)


class PushSerializer(serializers.Serializer):
    client_id = serializers.CharField(max_length=64)
    mutations = MutationSerializer(many=True)


class PullSerializer(serializers.Serializer):
    client_id = serializers.CharField(max_length=64)
    since_seq = serializers.IntegerField(min_value=0, default=0)
